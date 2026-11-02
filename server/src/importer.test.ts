import { describe, expect, it } from 'vitest'
import { FOLDER_MIME } from './driveClient'
import { IMPORTED_FOLDER, LOCK_TTL_MS, runImport } from './importer'
import { createMemoryStore } from './memoryStore'
import { createRepo } from './repo'
import { exportCsv, fakeDrive } from './testing'

async function setup() {
  const drive = fakeDrive()
  const store = createMemoryStore()
  const repo = createRepo(store)
  const folder = drive.add('shared', 'Kubi', '', FOLDER_MIME)
  await repo.update((s) => ({ after: s.data, meta: { folder: { id: folder, name: 'Kubi' } } }))
  return { ...drive, store, repo, folder }
}

describe('import', () => {
  it('imports exports oldest first, moves them, and alerts on bad ones', async () => {
    const { client, files, add, names, store, repo, folder } = await setup()
    add(folder, 'export-operations-02-10-2026_10-00-00.csv', exportCsv(['2026-10-01', 'B', '-2,00'], ['2026-09-30', 'A', '-1,00']))
    add(folder, 'export-operations-01-10-2026_10-00-00.csv', exportCsv(['2026-09-30', 'A', '-1,00']))
    add(folder, 'export-operations-03-10-2026_10-00-00.csv', 'pas un export')
    add(folder, 'notes.csv', 'ignoré')

    const report = await runImport(store, repo, client, () => 5000)
    expect(report.imported).toEqual([
      { name: 'export-operations-01-10-2026_10-00-00.csv', added: 1 },
      { name: 'export-operations-02-10-2026_10-00-00.csv', added: 1 },
    ])
    expect(report.alerts).toHaveLength(1)

    // Read back from the store, not the cache.
    const stored = await createRepo(store).current()
    expect(stored.data.operations.map((o) => o.label)).toEqual(['A', 'B'])
    expect(stored.data.accountNumber).toBe('0001')
    expect(stored.data.nextSeq).toBe(2)
    expect(stored.meta.lastImport).toEqual({ at: 5000, added: 2 })
    expect(stored.alerts.map((a) => a.message)).toEqual([report.alerts[0]])

    const imported = [...files.values()].find((f) => f.name === IMPORTED_FOLDER)!
    expect(names(imported.id)).toHaveLength(2)
    expect(names(folder)).toEqual(['export-operations-03-10-2026_10-00-00.csv', IMPORTED_FOLDER, 'notes.csv'])
  })

  it('raises an alert once, even after it is dismissed', async () => {
    const { client, add, store, repo, folder } = await setup()
    add(folder, 'export-operations-03-10-2026_10-00-00.csv', 'pas un export')
    await runImport(store, repo, client)
    const [alert] = (await repo.current()).alerts
    await repo.update((s) => ({ after: s.data, dismissAlerts: [alert.id] }))
    await runImport(store, repo, client)
    expect((await repo.current()).alerts).toEqual([{ ...alert, dismissed: true }])
  })

  it('does nothing while another import holds the lock', async () => {
    const { client, add, store, repo, folder } = await setup()
    add(folder, 'export-operations-01-10-2026_10-00-00.csv', exportCsv(['2026-09-30', 'A', '-1,00']))
    await store.acquireLock('other', 1000, LOCK_TTL_MS)
    expect((await runImport(store, repo, client, () => 1001)).busy).toBe(true)
    const report = await runImport(store, repo, client, () => 1000 + LOCK_TTL_MS)
    expect(report.imported).toHaveLength(1)
  })

  it('imports nothing new from the same export twice', async () => {
    const { client, add, store, repo, folder } = await setup()
    const csv = exportCsv(['2026-09-30', 'A', '-1,00'])
    add(folder, 'export-operations-01-10-2026_10-00-00.csv', csv)
    await runImport(store, repo, client)
    add(folder, 'export-operations-02-10-2026_10-00-00.csv', csv)
    expect((await runImport(store, repo, client)).imported).toEqual([{ name: 'export-operations-02-10-2026_10-00-00.csv', added: 0 }])
  })
})
