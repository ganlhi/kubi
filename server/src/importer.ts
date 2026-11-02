/**
 * Importing the bank exports dropped in the Drive folder.
 *
 * Runs from Cloud Scheduler every few minutes and on demand, possibly on
 * several instances at once, so the whole import takes a lock first. Each
 * file is merged into the data in its own write, then moved into `importés/`;
 * a file that cannot be imported stays in place and raises an alert once.
 */
import { randomUUID } from 'node:crypto'
import type { ImportReport } from '@kubi/domain/api'
import { CsvFormatError, exportTimestamp, parseExport } from '@kubi/domain/csv'
import { importRows } from '@kubi/domain/importOps'
import type { DriveClient } from './driveClient'
import type { Repo } from './repo'
import type { Store } from './store'

export const IMPORTED_FOLDER = 'importés'
export const LOCK_TTL_MS = 2 * 60_000

export type { ImportReport }

class ImportRefused extends Error {}

/** Import every export in the configured folder, oldest first. */
export async function runImport(store: Store, repo: Repo, drive: DriveClient, now: () => number = Date.now): Promise<ImportReport> {
  const report: ImportReport = { imported: [], alerts: [], busy: false }
  const folder = (await repo.current()).meta.folder
  if (!folder) return report
  const exports = (await drive.listFiles(folder.id))
    .map((f) => ({ ...f, ts: exportTimestamp(f.name) }))
    .filter((f): f is typeof f & { ts: string } => f.ts !== null)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
  if (exports.length === 0) return report

  const owner = randomUUID()
  if (!(await store.acquireLock(owner, now(), LOCK_TTL_MS))) return { ...report, busy: true }
  try {
    let importedFolderId: string | undefined
    for (const file of exports) {
      let added = 0
      try {
        const rows = parseExport(await drive.downloadText(file.id))
        await repo.update((state) => {
          const result = importRows(state.data, rows)
          if (!result.ok) throw new ImportRefused(result.error)
          added = result.added
          return { after: result.data }
        })
      } catch (e) {
        if (!(e instanceof CsvFormatError || e instanceof ImportRefused)) throw e
        report.alerts.push(`${file.name} : ${e.message}`)
        continue
      }
      importedFolderId ??=
        (await drive.listFolders(folder.id)).find((f) => f.name === IMPORTED_FOLDER)?.id ??
        (await drive.createFolder(folder.id, IMPORTED_FOLDER)).id
      await drive.moveFile(file.id, folder.id, importedFolderId)
      report.imported.push({ name: file.name, added })
    }
  } finally {
    await store.releaseLock(owner)
  }

  await repo.update((state) => {
    // An alert dismissed once is not raised again for the same file.
    const known = new Set(state.alerts.map((a) => a.message))
    const addAlerts = report.alerts.filter((m) => !known.has(m)).map((message) => ({ message, at: now() }))
    const added = report.imported.reduce((n, f) => n + f.added, 0)
    const meta = report.imported.length > 0 ? { lastImport: { at: now(), added } } : undefined
    return addAlerts.length > 0 || meta ? { after: state.data, meta, addAlerts } : null
  })
  return report
}
