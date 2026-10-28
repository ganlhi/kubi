import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DataFile } from '../domain/types'
import { createDriveClient, type DriveClient, type DriveFolder } from '../drive/driveClient'
import { getAccessToken, requestAccessToken } from '../drive/googleAuth'
import { loadOrCreate, refresh, runImport, save, type Loaded } from '../drive/repository'

export const envClientId = (): string => ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '').trim()

export class NeedsSignInError extends Error {
  constructor() {
    super('Connexion Google requise')
    this.name = 'NeedsSignInError'
  }
}

/** Identifies this tab as an import lock owner. */
const INSTANCE_ID = crypto.randomUUID()

type Change = (data: DataFile) => DataFile

interface Config {
  clientId: string
  folder: DriveFolder | null
}

interface KubiState extends Config {
  email: string | null
  /** Data as last confirmed on Drive. */
  confirmed: Loaded | null
  /** Local changes not yet written, applied on top of `confirmed` for display. */
  pending: Change[]
  busy: 'loading' | 'importing' | null
  /** Set when Drive could not be reached: the app goes read-only until the next successful sync. */
  error: string | null
  alerts: string[]
  lastImport: { at: number; added: number } | null

  setClientId(clientId: string): void
  setFolder(folder: DriveFolder | null): void
  signIn(): Promise<void>
  connect(): Promise<void>
  sync(): Promise<void>
  mutate(change: Change): void
  dismissAlert(index: number): void
}

export const driveClient = (): DriveClient =>
  createDriveClient(async () => {
    const token = await getAccessToken(useKubi.getState().clientId, { interactive: false })
    if (!token) throw new NeedsSignInError()
    return token
  })

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Drive work runs one step at a time, so a sync never overwrites an edit made meanwhile. */
let queue: Promise<unknown> = Promise.resolve()
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task)
  queue = run.catch(() => {})
  return run
}

export const useKubi = create<KubiState>()(
  persist(
    (set, get) => ({
      clientId: envClientId(),
      folder: null,
      email: null,
      confirmed: null,
      pending: [],
      busy: null,
      error: null,
      alerts: [],
      lastImport: null,

      setClientId: (clientId) => set({ clientId: clientId.trim() }),
      setFolder: (folder) => set({ folder, confirmed: null, pending: [] }),

      signIn: async () => {
        await requestAccessToken(get().clientId)
        set({ error: null })
      },

      connect: async () => {
        const { folder } = get()
        if (!folder) return
        set({ busy: 'loading', error: null })
        try {
          const client = driveClient()
          const email = await client.aboutEmail()
          // Also proves the folder is reachable, and names one known only by ID from an invitation.
          const named = await client.getFolder(folder.id)
          const confirmed = await enqueue(() => loadOrCreate(client, folder.id, email))
          set({ email, folder: named, confirmed, busy: null })
          await get().sync()
        } catch (e) {
          set({ busy: null, error: messageOf(e) })
        }
      },

      sync: async () => {
        const { folder } = get()
        if (!folder || !get().confirmed) return
        set({ busy: 'importing' })
        try {
          const report = await enqueue(async () => {
            const client = driveClient()
            const fresh = await refresh(client, get().confirmed!)
            set({ confirmed: fresh })
            return runImport(client, folder.id, fresh, INSTANCE_ID)
          })
          const added = report.imported.reduce((n, f) => n + f.added, 0)
          set((s) => ({
            confirmed: report.loaded,
            busy: null,
            error: null,
            alerts: [...s.alerts, ...report.alerts.filter((a) => !s.alerts.includes(a))],
            lastImport: report.imported.length > 0 ? { at: Date.now(), added } : s.lastImport,
          }))
        } catch (e) {
          set({ busy: null, error: messageOf(e) })
        }
      },

      mutate: (change) => {
        const { folder, error } = get()
        if (!folder || error) return
        set((s) => ({ pending: [...s.pending, change] }))
        void enqueue(async () => {
          const confirmed = await save(driveClient(), folder.id, get().confirmed!, change)
          set((s) => ({ confirmed, pending: s.pending.filter((c) => c !== change) }))
        }).catch((e: unknown) => {
          set({ pending: [], error: messageOf(e) })
        })
      },

      dismissAlert: (index) => set((s) => ({ alerts: s.alerts.filter((_, i) => i !== index) })),
    }),
    {
      name: 'kubi-config',
      partialize: (s): Config => ({ clientId: s.clientId, folder: s.folder }),
    },
  ),
)

/** The data as the user sees it: Drive's copy plus edits still being written. */
export function useData(): DataFile | null {
  const confirmed = useKubi((s) => s.confirmed)
  const pending = useKubi((s) => s.pending)
  return useMemo(() => (confirmed ? pending.reduce((d, change) => change(d), confirmed.data) : null), [confirmed, pending])
}
