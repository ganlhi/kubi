/** Fakes shared by the server tests. */
import { FOLDER_MIME, type DriveClient } from './driveClient'

interface FakeFile {
  id: string
  name: string
  parent: string
  mime: string
  content: string
}

/** An in-memory Drive, enough for the importer. */
export function fakeDrive() {
  const files = new Map<string, FakeFile>()
  let next = 0
  const add = (parent: string, name: string, content: string, mime = 'text/plain') => {
    const id = `f${next++}`
    files.set(id, { id, name, parent, mime, content })
    return id
  }
  const get = (id: string) => {
    const f = files.get(id)
    if (!f) throw new Error(`no file ${id}`)
    return f
  }
  const folders = (p: string) =>
    [...files.values()].filter((f) => f.parent === p && f.mime === FOLDER_MIME).map(({ id, name }) => ({ id, name }))
  const client: DriveClient = {
    listSharedFolders: async () => folders('shared'),
    listFolders: async (p) => folders(p),
    createFolder: async (p, name) => ({ id: add(p, name, '', FOLDER_MIME), name }),
    listFiles: async (p) => [...files.values()].filter((f) => f.parent === p && f.mime !== FOLDER_MIME),
    getFolder: async (id) => ({ id, name: get(id).name }),
    downloadJson: async (id) => JSON.parse(get(id).content),
    downloadText: async (id) => get(id).content,
    moveFile: async (id, _from, to) => {
      get(id).parent = to
    },
  }
  const names = (parent: string) => [...files.values()].filter((f) => f.parent === parent).map((f) => f.name).sort()
  return { client, files, add, names }
}

const HEADER =
  '"Date Opération";"Date Valeur";Libellé;"Libellé Suggéré";Catégorie;"Catégorie Parente";Solde;Commentaire;"Numéro Compte";"Libellé Compte";Solde;Pointage'
export const exportCsv = (...rows: [string, string, string][]) =>
  [HEADER, ...rows.map(([d, l, a]) => `${d};${d};"${l}";;;;${a};;0001;C;0;Non`)].join('\n')
