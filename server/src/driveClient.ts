/**
 * A thin client for the parts of the Google Drive v3 REST API the import uses:
 * walking the folders shared with the service account, reading the bank
 * exports dropped in one of them and moving them aside once imported. Plain
 * `fetch`, no Google SDK — the whole surface is a handful of endpoints, and
 * keeping it explicit makes it easy to fake in tests.
 */

export interface DriveFolder {
  id: string
  name: string
}

export interface DriveFileMeta {
  id: string
  name: string
}

export interface DriveClient {
  /** Folders shared with the account itself, by name: where browsing starts. */
  listSharedFolders(): Promise<DriveFolder[]>
  /** Immediate subfolders of `parentId`, by name. */
  listFolders(parentId: string): Promise<DriveFolder[]>
  createFolder(parentId: string, name: string): Promise<DriveFolder>
  /** Every non-folder file directly inside `folderId`. */
  listFiles(folderId: string): Promise<DriveFileMeta[]>
  getFolder(folderId: string): Promise<DriveFolder>
  downloadJson(fileId: string): Promise<unknown>
  downloadText(fileId: string): Promise<string>
  moveFile(fileId: string, fromFolderId: string, toFolderId: string): Promise<void>
}

export class DriveApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DriveApiError'
    this.status = status
  }
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder'

const API = 'https://www.googleapis.com/drive/v3'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * `getToken` is asked for a bearer token on every request, so a token that is
 * refreshed between calls is picked up without rebuilding the client.
 */
export function createDriveClient(
  getToken: () => Promise<string>,
  fetchFn: FetchLike = (input, init) => fetch(input, init),
): DriveClient {
  const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const token = await getToken()
    const headers: Record<string, string> = {
      ...((init.headers as Record<string, string> | undefined) ?? {}),
      Authorization: `Bearer ${token}`,
    }
    const res = await fetchFn(url, { ...init, headers })
    if (!res.ok) {
      let message = `Google Drive a répondu ${res.status}`
      try {
        const body = (await res.json()) as { error?: { message?: string } }
        if (body?.error?.message) message = body.error.message
      } catch {
        // Not a JSON error body; the status is all we have.
      }
      throw new DriveApiError(res.status, message)
    }
    return res
  }

  const listAll = async <T>(q: string, fields: string): Promise<T[]> => {
    const out: T[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken, files(${fields})`,
        pageSize: '1000',
        orderBy: 'name',
        // The folders the service account sees all live in someone else's drive.
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const page = (await (await request(`${API}/files?${params}`)).json()) as {
        files?: T[]
        nextPageToken?: string
      }
      out.push(...(page.files ?? []))
      pageToken = page.nextPageToken
    } while (pageToken)
    return out
  }

  return {
    listSharedFolders: () => listAll<DriveFolder>(`sharedWithMe and mimeType = '${FOLDER_MIME}' and trashed = false`, 'id, name'),

    listFolders: (parentId) =>
      listAll<DriveFolder>(
        `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
        'id, name',
      ),

    createFolder: async (parentId, name) => {
      const res = await request(`${API}/files?fields=id,name&supportsAllDrives=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
      })
      return (await res.json()) as DriveFolder
    },

    listFiles: (folderId) =>
      listAll<DriveFileMeta>(
        `'${folderId}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`,
        'id, name',
      ),

    getFolder: async (folderId) =>
      (await (await request(`${API}/files/${folderId}?fields=id,name&supportsAllDrives=true`)).json()) as DriveFolder,

    downloadJson: async (fileId) => (await request(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`)).json(),

    downloadText: async (fileId) => (await request(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`)).text(),

    moveFile: async (fileId, fromFolderId, toFolderId) => {
      const params = new URLSearchParams({ addParents: toFolderId, removeParents: fromFolderId, fields: 'id', supportsAllDrives: 'true' })
      await request(`${API}/files/${fileId}?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    },
  }
}
