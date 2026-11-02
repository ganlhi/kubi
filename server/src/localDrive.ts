/**
 * Drive faked by a local directory, for development: each subdirectory of
 * `root` is a folder "shared with" the server, and IDs are paths below `root`.
 */
import { mkdir, readdir, readFile, rename } from 'node:fs/promises'
import { basename, join, normalize, sep } from 'node:path'
import { DriveApiError, type DriveClient } from './driveClient'

export function createLocalDrive(root: string): DriveClient {
  const path = (id: string) => {
    const rel = normalize(id)
    if (rel.startsWith('..') || rel.startsWith(sep)) throw new DriveApiError(404, `Introuvable : ${id}`)
    return join(root, rel)
  }
  const entries = async (id: string, dirs: boolean) =>
    (await readdir(path(id), { withFileTypes: true }))
      .filter((e) => e.isDirectory() === dirs && !e.name.startsWith('.'))
      .map((e) => ({ id: id ? join(id, e.name) : e.name, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name))

  return {
    listSharedFolders: () => entries('', true),
    listFolders: (parentId) => entries(parentId, true),
    createFolder: async (parentId, name) => {
      await mkdir(path(join(parentId, name)))
      return { id: join(parentId, name), name }
    },
    listFiles: (folderId) => entries(folderId, false),
    getFolder: async (folderId) => {
      try {
        await readdir(path(folderId))
      } catch {
        throw new DriveApiError(404, `Dossier introuvable : ${folderId}`)
      }
      return { id: folderId, name: basename(folderId) }
    },
    downloadJson: async (fileId) => JSON.parse(await readFile(path(fileId), 'utf8')),
    downloadText: (fileId) => readFile(path(fileId), 'utf8'),
    moveFile: async (fileId, _from, toFolderId) => {
      await rename(path(fileId), path(join(toFolderId, basename(fileId))))
    },
  }
}
