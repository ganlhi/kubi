import { useMemo } from 'react'
import { create } from 'zustand'
import type { AlertView, DataResponse, Folder, ImportReport, ServerState } from '@kubi/domain/api'
import { applyCommand, type Command } from '@kubi/domain/commands'
import type { DataFile } from '@kubi/domain/types'
import { api, ApiError, NOT_MEMBER } from '../api/client'

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

interface KubiState {
  /** Undefined until the server answers; false when the signed-in account is not a member. */
  member: boolean | undefined
  email: string | null
  /** Data as last confirmed by the server. */
  confirmed: { version: number; data: DataFile } | null
  /** Local changes not yet written, applied on top of `confirmed` for display. */
  pending: Command[]
  folder: Folder | null
  lastImport: ServerState['lastImport']
  alerts: AlertView[]
  serviceAccountEmail: string
  busy: 'loading' | 'importing' | null
  /** Set when the server could not be reached: the app goes read-only until the next successful load. */
  error: string | null

  load(): Promise<void>
  importNow(): Promise<void>
  mutate(command: Command): void
  dismissAlert(id: string): Promise<void>
  setFolder(id: string): Promise<void>
  reset(): void
}

/** Server work runs one step at a time, so a load never overwrites an edit made meanwhile. */
let queue: Promise<unknown> = Promise.resolve()
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task)
  queue = run.catch(() => {})
  return run
}

const initial = {
  member: undefined,
  email: null,
  confirmed: null,
  pending: [],
  folder: null,
  lastImport: null,
  alerts: [],
  serviceAccountEmail: '',
  busy: null,
  error: null,
} satisfies Partial<KubiState>

export const useKubi = create<KubiState>()((set, get) => {
  /** The server's state, or nothing new if it is still at the version shown. */
  const fetchState = async (): Promise<Partial<KubiState>> => {
    const known = get().confirmed?.version
    const res = await api<DataResponse>('GET', `/data${known === undefined ? '' : `?version=${known}`}`)
    if (res.unchanged) return { member: true, error: null }
    const { version, data, ...rest } = res
    return { ...rest, member: true, error: null, confirmed: { version, data } }
  }

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 403 && e.message === NOT_MEMBER) set({ member: false, busy: null })
    else set({ busy: null, pending: [], error: messageOf(e) })
  }

  return {
    ...initial,

    load: async () => {
      set((s) => ({ busy: s.confirmed ? s.busy : 'loading' }))
      try {
        const fresh = await enqueue(fetchState)
        set((s) => ({ ...fresh, busy: s.busy === 'loading' ? null : s.busy }))
      } catch (e) {
        fail(e)
      }
    },

    importNow: async () => {
      set({ busy: 'importing' })
      try {
        await enqueue(() => api<ImportReport>('POST', '/import'))
        const fresh = await enqueue(fetchState)
        set({ ...fresh, busy: null })
      } catch (e) {
        fail(e)
      }
    },

    mutate: (command) => {
      if (get().error) return
      set((s) => ({ pending: [...s.pending, command] }))
      void enqueue(async () => {
        const before = get().confirmed
        const { version } = await api<{ version: number }>('POST', '/commands', { command })
        // Nobody else wrote in between: the server ran this very command on this very data.
        const fresh =
          before && version === before.version + 1
            ? { confirmed: { version, data: applyCommand(before.data, command) } }
            : await fetchState()
        set((s) => ({ ...fresh, pending: s.pending.filter((c) => c !== command) }))
      }).catch(fail)
    },

    dismissAlert: async (id) => {
      set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) }))
      try {
        await api('DELETE', `/alerts/${encodeURIComponent(id)}`)
      } catch (e) {
        fail(e)
      }
    },

    setFolder: async (id) => {
      await api('PUT', '/config/folder', { id })
      await get().load()
    },

    reset: () => set(initial),
  }
})

/** The data as the user sees it: the server's copy plus edits still being written. */
export function useData(): DataFile | null {
  const confirmed = useKubi((s) => s.confirmed)
  const pending = useKubi((s) => s.pending)
  return useMemo(() => (confirmed ? pending.reduce(applyCommand, confirmed.data) : null), [confirmed, pending])
}
