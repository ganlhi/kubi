/**
 * The data file and the bank exports, as they live in the shared Drive folder.
 *
 * Several people (and tabs) write the same file, which is rewritten whole, so
 * every write is optimistic: the version is checked first, and if someone else
 * got there in between, their file is reloaded and the change replayed on it.
 * Drive has no compare-and-swap, so a write landing between the check and the
 * upload can still be lost; the window is a single request long.
 *
 * Imports additionally take a lock file, so two instances never import the
 * same exports at once.
 */
import { CsvFormatError, exportTimestamp, parseExport } from '../domain/csv'
import { authorize } from '../domain/edits'
import { importRows } from '../domain/importOps'
import { emptyDataFile, type DataFile } from '../domain/types'
import type { DriveClient } from './driveClient'

export const DATA_FILE = 'kubi-data.json'
export const LOCK_FILE = 'kubi.lock'
export const IMPORTED_FOLDER = 'importés'
export const LOCK_TTL_MS = 2 * 60_000

export interface Loaded {
  fileId: string
  version: string
  data: DataFile
}

/** Open the folder's data file, creating it if needed, with `email` among the authorised accounts. */
export async function loadOrCreate(client: DriveClient, folderId: string, email: string): Promise<Loaded> {
  const existing = (await client.listFiles(folderId)).find((f) => f.name === DATA_FILE)
  if (!existing) {
    const data = emptyDataFile(email.toLowerCase())
    const { id, version } = await client.uploadJson(folderId, DATA_FILE, data)
    return { fileId: id, version, data }
  }
  const loaded = await download(client, existing.id)
  if (authorize(loaded.data, email) === loaded.data) return loaded
  return save(client, folderId, loaded, (d) => authorize(d, email))
}

async function download(client: DriveClient, fileId: string): Promise<Loaded> {
  // Version first: if the file changes during the download, the next check sees it.
  const version = await client.getVersion(fileId)
  const data = (await client.downloadJson(fileId)) as DataFile
  return { fileId, version, data }
}

/** The file as it is on Drive now; `current` itself if nobody changed it. */
export async function refresh(client: DriveClient, current: Loaded): Promise<Loaded> {
  const version = await client.getVersion(current.fileId)
  return version === current.version ? current : download(client, current.fileId)
}

/** Apply `change` to the latest data on Drive and write it back. `change` may run on data newer than the caller's. */
export async function save(
  client: DriveClient,
  folderId: string,
  current: Loaded,
  change: (data: DataFile) => DataFile,
): Promise<Loaded> {
  const base = await refresh(client, current)
  const data = change(base.data)
  if (data === base.data) return base
  const { version } = await client.uploadJson(folderId, DATA_FILE, data, base.fileId)
  return { fileId: base.fileId, version, data }
}

interface LockContent {
  owner: string
  at: number
}

/**
 * Take the import lock for `owner`, or null if another live instance holds it.
 * Two instances may both write a lock in the same instant; each then re-reads,
 * and only the earliest (then smallest owner) keeps it.
 */
export async function acquireLock(client: DriveClient, folderId: string, owner: string, now = Date.now()): Promise<string | null> {
  const live = async () => {
    const locks = (await client.listFiles(folderId)).filter((f) => f.name === LOCK_FILE)
    const out: (LockContent & { id: string })[] = []
    for (const f of locks) {
      const content = (await client.downloadJson(f.id)) as LockContent
      if (now - content.at < LOCK_TTL_MS) out.push({ ...content, id: f.id })
      else await client.deleteFile(f.id)
    }
    return out
  }

  if ((await live()).some((l) => l.owner !== owner)) return null
  const { id } = await client.uploadJson(folderId, LOCK_FILE, { owner, at: now } satisfies LockContent)
  const winner = (await live()).sort((a, b) => a.at - b.at || (a.owner < b.owner ? -1 : 1))[0]
  if (winner?.id === id) return id
  await client.deleteFile(id)
  return null
}

export interface ImportReport {
  loaded: Loaded
  /** Files imported, with how many new operations each brought. */
  imported: { name: string; added: number }[]
  /** Files left in place, and why. */
  alerts: string[]
  /** True when another instance held the lock and nothing was tried. */
  busy: boolean
}

class ImportRefused extends Error {}

/** Import every export in the folder, oldest first, moving each one done into `importés/`. */
export async function runImport(client: DriveClient, folderId: string, loaded: Loaded, owner: string): Promise<ImportReport> {
  const report: ImportReport = { loaded, imported: [], alerts: [], busy: false }
  const exports = (await client.listFiles(folderId))
    .map((f) => ({ ...f, ts: exportTimestamp(f.name) }))
    .filter((f): f is typeof f & { ts: string } => f.ts !== null)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
  if (exports.length === 0) return report

  const lockId = await acquireLock(client, folderId, owner)
  if (!lockId) return { ...report, busy: true }
  try {
    let importedFolderId: string | undefined
    for (const file of exports) {
      let added = 0
      try {
        const rows = parseExport(await client.downloadText(file.id))
        report.loaded = await save(client, folderId, report.loaded, (d) => {
          const result = importRows(d, rows)
          if (!result.ok) throw new ImportRefused(result.error)
          added = result.added
          return result.data
        })
      } catch (e) {
        if (!(e instanceof CsvFormatError || e instanceof ImportRefused)) throw e
        report.alerts.push(`${file.name} : ${e.message}`)
        continue
      }
      importedFolderId ??=
        (await client.listFolders(folderId)).find((f) => f.name === IMPORTED_FOLDER)?.id ??
        (await client.createFolder(folderId, IMPORTED_FOLDER)).id
      await client.moveFile(file.id, folderId, importedFolderId)
      report.imported.push({ name: file.name, added })
    }
  } finally {
    await client.deleteFile(lockId)
  }
  return report
}
