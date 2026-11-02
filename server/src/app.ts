/**
 * The HTTP API. Everything outside it — the store, Drive, token checks — comes
 * in through `Deps`, so tests run it against memory and fakes.
 */
import { Hono } from 'hono'
import type { DataResponse, MigrationPreview, MigrationReport, ServerState } from '@kubi/domain/api'
import { applyCommand, isCommand } from '@kubi/domain/commands'
import type { DataFile } from '@kubi/domain/types'
import { DriveApiError, type DriveClient } from './driveClient'
import { runImport } from './importer'
import { ConflictError, type Repo } from './repo'
import { normalizeEmail, type State, type Store } from './store'

export interface Deps {
  store: Store
  repo: Repo
  drive: DriveClient
  /** The verified email behind a Firebase ID token, or null if the token is not valid. */
  verifyUser(token: string): Promise<string | null>
  /** Whether a token was issued to Cloud Scheduler for this service. */
  verifyScheduler(token: string): Promise<boolean>
  /** The account the Drive folder must be shared with. */
  serviceAccountEmail: string
  /** Let in this address while nobody is a member yet. */
  bootstrapEmail?: string
}

/** The data file as the app wrote it to Drive before it had a server. */
export const LEGACY_DATA_FILE = 'kubi-data.json'

/** The old file also listed the accounts let in. */
type LegacyDataFile = DataFile & { authorizedEmails?: string[] }

const bearer = (header: string | undefined): string | null => header?.match(/^Bearer (.+)$/)?.[1] ?? null

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const hasData = (d: DataFile): boolean =>
  d.operations.length + d.categories.length + d.ignoredIds.length + (d.accountPlans?.length ?? 0) > 0

export function createApp(deps: Deps) {
  const { store, repo, drive } = deps
  const app = new Hono<{ Variables: { email: string } }>()

  app.onError((e, c) => {
    if (e instanceof ConflictError) return c.json({ error: e.message }, 409)
    if (e instanceof DriveApiError) return c.json({ error: `Google Drive : ${e.message}` }, 502)
    console.error(e)
    return c.json({ error: messageOf(e) }, 500)
  })

  app.get('/healthz', (c) => c.text('ok'))

  app.post('/internal/import', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    if (!token || !(await deps.verifyScheduler(token))) return c.json({ error: 'Non autorisé' }, 401)
    return c.json(await runImport(store, repo, drive))
  })

  app.use('/api/*', async (c, next) => {
    const token = bearer(c.req.header('Authorization'))
    const email = token && (await deps.verifyUser(token))
    if (!email) return c.json({ error: 'Connexion requise' }, 401)
    if (!(await store.isMember(email))) {
      const bootstrap = deps.bootstrapEmail && normalizeEmail(deps.bootstrapEmail) === normalizeEmail(email)
      if (!bootstrap || (await store.members()).length > 0) return c.json({ error: 'not-member', email }, 403)
      await store.addMember(email, 'bootstrap')
    }
    c.set('email', normalizeEmail(email))
    await next()
  })

  const view = (s: State, email: string): ServerState => ({
    version: s.version,
    data: s.data,
    folder: s.meta.folder,
    lastImport: s.meta.lastImport,
    alerts: s.alerts.filter((a) => !a.dismissed).map(({ id, message, at }) => ({ id, message, at })),
    email,
    serviceAccountEmail: deps.serviceAccountEmail,
  })

  app.get('/api/data', async (c) => {
    const state = await repo.current()
    const body: DataResponse =
      c.req.query('version') === String(state.version)
        ? { unchanged: true, version: state.version }
        : { unchanged: false, ...view(state, c.get('email')) }
    return c.json(body)
  })

  app.post('/api/commands', async (c) => {
    const { command } = await c.req.json<{ command?: unknown }>()
    if (!isCommand(command)) return c.json({ error: 'Commande inconnue' }, 400)
    const state = await repo.update((s) => ({ after: applyCommand(s.data, command) }))
    return c.json({ version: state.version })
  })

  app.post('/api/import', async (c) => c.json(await runImport(store, repo, drive)))

  app.delete('/api/alerts/:id', async (c) => {
    const id = c.req.param('id')
    await repo.update((s) => (s.alerts.some((a) => a.id === id) ? { after: s.data, dismissAlerts: [id] } : null))
    return c.body(null, 204)
  })

  app.get('/api/drive/folders', async (c) => {
    const parent = c.req.query('parent')
    return c.json(parent ? await drive.listFolders(parent) : await drive.listSharedFolders())
  })

  app.put('/api/config/folder', async (c) => {
    const { id } = await c.req.json<{ id?: unknown }>()
    if (typeof id !== 'string' || !id) return c.json({ error: 'Dossier manquant' }, 400)
    // Also proves the service account can reach it.
    const folder = await drive.getFolder(id)
    await repo.update((s) => ({ after: s.data, meta: { folder: { id: folder.id, name: folder.name } } }))
    return c.json(folder)
  })

  app.get('/api/members', async (c) => c.json(await store.members()))

  app.post('/api/members', async (c) => {
    const { email } = await c.req.json<{ email?: unknown }>()
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(email.trim())) return c.json({ error: 'Adresse invalide' }, 400)
    await store.addMember(email, c.get('email'))
    return c.json(await store.members())
  })

  app.delete('/api/members/:email', async (c) => {
    const email = normalizeEmail(c.req.param('email'))
    if (email === c.get('email')) return c.json({ error: 'Impossible de se retirer soi-même' }, 400)
    await store.removeMember(email)
    return c.json(await store.members())
  })

  /**
   * One-off: bring over the data file the app kept in the Drive folder before
   * it had a server. With `?dryRun=1` it only reports what it found; otherwise
   * the body says who becomes a member (`MigrationRequest`).
   */
  app.post('/api/admin/migrate', async (c) => {
    const state = await repo.current()
    if (!state.meta.folder) return c.json({ error: 'Aucun dossier configuré' }, 400)
    if (hasData(state.data)) return c.json({ error: 'Des données existent déjà' }, 409)
    const file = (await drive.listFiles(state.meta.folder.id)).find((f) => f.name === LEGACY_DATA_FILE)
    if (!file) return c.json({ error: `${LEGACY_DATA_FILE} introuvable dans le dossier` }, 404)
    const { authorizedEmails = [], ...legacy } = (await drive.downloadJson(file.id)) as LegacyDataFile
    const counts = {
      operations: legacy.operations?.length ?? 0,
      categories: legacy.categories?.length ?? 0,
      ignoredIds: legacy.ignoredIds?.length ?? 0,
      accountPlans: legacy.accountPlans?.length ?? 0,
    }
    if (c.req.query('dryRun') === '1') {
      return c.json({ emails: [...new Set(authorizedEmails.map(normalizeEmail))].sort(), ...counts } satisfies MigrationPreview)
    }

    const body = await c.req.json<Partial<{ members: unknown; exclude: unknown }>>().catch(() => ({}) as Partial<{ members: unknown; exclude: unknown }>)
    const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
    let members: string[]
    if (strings(body.members)) members = body.members
    else if (strings(body.exclude)) {
      const excluded = new Set(body.exclude.map(normalizeEmail))
      members = authorizedEmails.filter((e) => !excluded.has(normalizeEmail(e)))
    } else return c.json({ error: 'Indiquez les membres à garder (members) ou à exclure (exclude)' }, 400)
    members = [...new Set([...members, c.get('email')].map(normalizeEmail))].sort()

    await repo.update((s) => {
      if (hasData(s.data)) throw new ConflictError()
      return { after: { ...legacy, schema: 1 } as DataFile }
    })
    for (const email of members) if (!(await store.isMember(email))) await store.addMember(email, c.get('email'))
    return c.json({ ...counts, members } satisfies MigrationReport)
  })

  /** The whole data in the old file's format: enough to go back to the Drive-only app without losing anything. */
  app.get('/api/admin/export', async (c) => {
    const { data } = await repo.current()
    const legacy: LegacyDataFile = { ...data, authorizedEmails: await store.members() }
    c.header('Content-Disposition', `attachment; filename="${LEGACY_DATA_FILE}"`)
    return c.json(legacy)
  })

  return app
}
