import { describe, expect, it } from 'vitest'
import type { Command } from '@kubi/domain/commands'
import { createApp, LEGACY_DATA_FILE } from './app'
import { FOLDER_MIME } from './driveClient'
import { createMemoryStore } from './memoryStore'
import { createRepo } from './repo'
import { exportCsv, fakeDrive } from './testing'

/** Tokens are the email they stand for; `scheduler` is Cloud Scheduler's. */
function setup() {
  const drive = fakeDrive()
  const store = createMemoryStore()
  const app = createApp({
    store,
    repo: createRepo(store),
    drive: drive.client,
    verifyUser: async (token) => (token.includes('@') ? token : null),
    verifyScheduler: async (token) => token === 'scheduler',
    serviceAccountEmail: 'kubi-api@p.iam.gserviceaccount.com',
    bootstrapEmail: 'Admin@x.fr',
  })
  const call = (method: string, path: string, as = 'admin@x.fr', body?: unknown) =>
    app.request(path, {
      method,
      headers: { Authorization: `Bearer ${as}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const json = async <T = Record<string, unknown>>(res: Response | Promise<Response>) => (await res).json() as Promise<T>
  return { app, store, drive, call, json }
}

describe('api', () => {
  it('lets in the bootstrap admin, then members only', async () => {
    const { call, json } = setup()
    expect((await call('GET', '/api/data', 'other@x.fr')).status).toBe(403)
    expect((await call('GET', '/api/data', 'nope')).status).toBe(401)
    expect((await call('GET', '/api/data')).status).toBe(200)
    await call('POST', '/api/members', 'admin@x.fr', { email: 'Other@x.fr' })
    expect(await json(call('GET', '/api/members', 'other@x.fr'))).toEqual(['admin@x.fr', 'other@x.fr'])
    expect((await call('DELETE', '/api/members/admin@x.fr')).status).toBe(400)
  })

  it('applies commands and answers unchanged when nothing moved', async () => {
    const { call, json } = setup()
    const command: Command = { type: 'addTemporary', id: 'temp:1', date: '2026-10-03', label: 'Courses', amountCents: -5000 }
    const { version } = await json<{ version: number }>(call('POST', '/api/commands', undefined, { command }))
    const data = await json<{ data: { operations: unknown[] }; version: number }>(call('GET', '/api/data'))
    expect(data.version).toBe(version)
    expect(data.data.operations).toHaveLength(1)
    expect(await json(call('GET', `/api/data?version=${version}`))).toEqual({ unchanged: true, version })
    expect((await call('POST', '/api/commands', undefined, { command: { type: 'nope' } })).status).toBe(400)
  })

  it('configures the folder, imports, and lets alerts be dismissed', async () => {
    const { call, json, drive } = setup()
    const folder = drive.add('shared', 'Kubi', '', FOLDER_MIME)
    expect(await json(call('GET', '/api/drive/folders'))).toEqual([{ id: folder, name: 'Kubi' }])
    await call('PUT', '/api/config/folder', undefined, { id: folder })
    drive.add(folder, 'export-operations-01-10-2026_10-00-00.csv', exportCsv(['2026-09-30', 'A', '-1,00']))
    drive.add(folder, 'export-operations-02-10-2026_10-00-00.csv', 'cassé')

    expect((await call('POST', '/internal/import', 'admin@x.fr')).status).toBe(401)
    const report = await json<{ imported: unknown[] }>(call('POST', '/internal/import', 'scheduler'))
    expect(report.imported).toHaveLength(1)

    const state = await json<{ folder: unknown; alerts: { id: string }[] }>(call('GET', '/api/data'))
    expect(state.folder).toEqual({ id: folder, name: 'Kubi' })
    expect(state.alerts).toHaveLength(1)
    await call('DELETE', `/api/alerts/${state.alerts[0].id}`)
    expect((await json<{ alerts: unknown[] }>(call('GET', '/api/data'))).alerts).toEqual([])
  })

  it('migrates the old data file once', async () => {
    const { call, json, drive } = setup()
    const folder = drive.add('shared', 'Kubi', '', FOLDER_MIME)
    await call('PUT', '/api/config/folder', undefined, { id: folder })
    drive.add(
      folder,
      LEGACY_DATA_FILE,
      JSON.stringify({
        schema: 1,
        authorizedEmails: ['admin@x.fr', 'b@x.fr', 'stranger@x.fr'],
        accountNumber: '0001',
        categories: [{ id: 'c', name: 'C', color: '#000000', kind: 'expense', budgets: [] }],
        operations: [{ id: 'o', date: '2026-10-01', valueDate: '2026-10-01', label: 'O', amountCents: -1, seq: 0, categoryId: 'c' }],
        ignoredIds: ['gone'],
        nextSeq: 1,
      }),
    )
    const counts = { operations: 1, categories: 1, ignoredIds: 1, accountPlans: 0 }
    // The dry run writes nothing.
    expect(await json(call('POST', '/api/admin/migrate?dryRun=1'))).toEqual({ emails: ['admin@x.fr', 'b@x.fr', 'stranger@x.fr'], ...counts })
    expect((await json<{ data: { operations: unknown[] } }>(call('GET', '/api/data'))).data.operations).toEqual([])
    // The file's list is never taken unexamined.
    expect((await call('POST', '/api/admin/migrate', undefined, {})).status).toBe(400)

    expect(await json(call('POST', '/api/admin/migrate', undefined, { exclude: ['Stranger@x.fr'] }))).toEqual({ ...counts, members: ['admin@x.fr', 'b@x.fr'] })
    expect((await call('POST', '/api/admin/migrate', undefined, { exclude: [] })).status).toBe(409)
    expect((await call('GET', '/api/data', 'stranger@x.fr')).status).toBe(403)
    const state = await json<{ data: { accountNumber: string; operations: { categoryId: string }[] } }>(call('GET', '/api/data', 'b@x.fr'))
    expect(state.data.accountNumber).toBe('0001')
    expect(state.data.operations[0].categoryId).toBe('c')

    // The export round-trips to the old format, members included.
    const exported = await json<{ authorizedEmails: string[]; operations: unknown[] }>(call('GET', '/api/admin/export'))
    expect(exported.authorizedEmails).toEqual(['admin@x.fr', 'b@x.fr'])
    expect(exported.operations).toHaveLength(1)
  })

  it('takes an explicit member list, and always keeps the admin', async () => {
    const { call, json, drive } = setup()
    const folder = drive.add('shared', 'Kubi', '', FOLDER_MIME)
    await call('PUT', '/api/config/folder', undefined, { id: folder })
    drive.add(folder, LEGACY_DATA_FILE, JSON.stringify({ schema: 1, authorizedEmails: ['b@x.fr'], categories: [], operations: [], ignoredIds: [], nextSeq: 0 }))
    const report = await json<{ members: string[] }>(call('POST', '/api/admin/migrate', undefined, { members: ['c@x.fr'] }))
    expect(report.members).toEqual(['admin@x.fr', 'c@x.fr'])
  })
})
