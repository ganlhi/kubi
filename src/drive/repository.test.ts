import { describe, expect, it } from 'vitest'
import { FOLDER_MIME, type DriveClient } from './driveClient'
import { DATA_FILE, IMPORTED_FOLDER, LOCK_FILE, LOCK_TTL_MS, acquireLock, loadOrCreate, runImport, save } from './repository'
import type { DataFile } from '../domain/types'

interface FakeFile {
  id: string
  name: string
  parent: string
  mime: string
  content: string
  version: number
}

/** An in-memory Drive, enough for the repository. */
function fakeDrive() {
  const files = new Map<string, FakeFile>()
  let next = 0
  const add = (parent: string, name: string, content: string, mime = 'text/plain') => {
    const id = `f${next++}`
    files.set(id, { id, name, parent, mime, content, version: 1 })
    return id
  }
  const get = (id: string) => {
    const f = files.get(id)
    if (!f) throw new Error(`no file ${id}`)
    return f
  }
  const client: DriveClient = {
    listFolders: async (p) => [...files.values()].filter((f) => f.parent === p && f.mime === FOLDER_MIME),
    createFolder: async (p, name) => ({ id: add(p, name, '', FOLDER_MIME), name }),
    listFiles: async (p) => [...files.values()].filter((f) => f.parent === p && f.mime !== FOLDER_MIME),
    aboutEmail: async () => 'a@x',
    getFolder: async (id) => get(id),
    downloadJson: async (id) => JSON.parse(get(id).content),
    downloadText: async (id) => get(id).content,
    getVersion: async (id) => String(get(id).version),
    uploadJson: async (p, name, data, existingId) => {
      if (existingId) {
        const f = get(existingId)
        f.content = JSON.stringify(data)
        f.version++
        return { id: f.id, version: String(f.version) }
      }
      const id = add(p, name, JSON.stringify(data))
      return { id, version: '1' }
    },
    moveFile: async (id, _from, to) => {
      get(id).parent = to
    },
    shareWith: async () => {},
    deleteFile: async (id) => {
      files.delete(id)
    },
  }
  return { client, files, add }
}

const HEADER =
  '"Date Opération";"Date Valeur";Libellé;"Libellé Suggéré";Catégorie;"Catégorie Parente";Solde;Commentaire;"Numéro Compte";"Libellé Compte";Solde;Pointage'
const exportCsv = (...rows: [string, string, string][]) =>
  [HEADER, ...rows.map(([d, l, a]) => `${d};${d};"${l}";;;;${a};;0001;C;0;Non`)].join('\n')

describe('repository', () => {
  it('creates the data file, then authorises a newcomer', async () => {
    const { client, files } = fakeDrive()
    const first = await loadOrCreate(client, 'root', 'A@x.fr')
    expect(first.data.authorizedEmails).toEqual(['a@x.fr'])
    const second = await loadOrCreate(client, 'root', 'b@x.fr')
    expect(second.data.authorizedEmails).toEqual(['a@x.fr', 'b@x.fr'])
    expect([...files.values()].filter((f) => f.name === DATA_FILE)).toHaveLength(1)
  })

  it('replays a change on top of someone else’s write', async () => {
    const { client } = fakeDrive()
    const mine = await loadOrCreate(client, 'root', 'a@x')
    const theirs = await save(client, 'root', mine, (d) => ({ ...d, ignoredIds: ['theirs'] }))
    expect(theirs.version).not.toBe(mine.version)
    const after = await save(client, 'root', mine, (d) => ({ ...d, ignoredIds: [...d.ignoredIds, 'mine'] }))
    expect(after.data.ignoredIds).toEqual(['theirs', 'mine'])
  })

  it('refuses a live lock held by someone else, takes a stale one', async () => {
    const { client, add } = fakeDrive()
    add('root', LOCK_FILE, JSON.stringify({ owner: 'other', at: 1000 }))
    expect(await acquireLock(client, 'root', 'me', 1000 + 1)).toBeNull()
    expect(await acquireLock(client, 'root', 'me', 1000 + LOCK_TTL_MS)).not.toBeNull()
  })

  it('imports exports oldest first, moves them, and alerts on bad ones', async () => {
    const { client, files, add } = fakeDrive()
    const loaded = await loadOrCreate(client, 'root', 'a@x')
    add('root', 'export-operations-02-10-2026_10-00-00.csv', exportCsv(['2026-10-01', 'B', '-2,00'], ['2026-09-30', 'A', '-1,00']))
    add('root', 'export-operations-01-10-2026_10-00-00.csv', exportCsv(['2026-09-30', 'A', '-1,00']))
    add('root', 'export-operations-03-10-2026_10-00-00.csv', 'pas un export')
    add('root', 'notes.csv', 'ignoré')

    const report = await runImport(client, 'root', loaded, 'me')
    expect(report.imported).toEqual([
      { name: 'export-operations-01-10-2026_10-00-00.csv', added: 1 },
      { name: 'export-operations-02-10-2026_10-00-00.csv', added: 1 },
    ])
    expect(report.alerts).toHaveLength(1)
    expect(report.loaded.data.operations.map((o) => o.label)).toEqual(['A', 'B'])

    const imported = [...files.values()].find((f) => f.name === IMPORTED_FOLDER)!
    const names = (parent: string) => [...files.values()].filter((f) => f.parent === parent).map((f) => f.name).sort()
    expect(names(imported.id)).toHaveLength(2)
    expect(names('root')).toEqual(['export-operations-03-10-2026_10-00-00.csv', IMPORTED_FOLDER, DATA_FILE, 'notes.csv'])
    const stored = JSON.parse([...files.values()].find((f) => f.name === DATA_FILE)!.content) as DataFile
    expect(stored.operations).toHaveLength(2)
  })
})
