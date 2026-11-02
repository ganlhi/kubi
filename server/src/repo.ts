/**
 * The data as the server works with it: the whole state, kept in memory and
 * reloaded only when the store's version moved, and an `update` that replays
 * a change on fresh data whenever someone else wrote first.
 */
import type { Change, State, Store } from './store'

export interface Repo {
  current(): Promise<State>
  /**
   * Apply what `change` returns for the latest state, or nothing if it returns
   * null. `change` may run more than once, and may throw to give up.
   */
  update(change: (state: State) => Omit<Change, 'before'> | null): Promise<State>
}

const MAX_ATTEMPTS = 5

export class ConflictError extends Error {
  constructor() {
    super('Trop d’écritures simultanées, réessayez')
    this.name = 'ConflictError'
  }
}

export function createRepo(store: Store): Repo {
  let cache: State | null = null

  const current = async (): Promise<State> => {
    if (cache && cache.version === (await store.version())) return cache
    cache = await store.load()
    return cache
  }

  return {
    current,

    update: async (change) => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const state = await current()
        const c = change(state)
        if (!c) return state
        const version = await store.commit(state.version, { ...c, before: state.data })
        if (version === null) {
          cache = null
          continue
        }
        // New alerts get their IDs from the store: read them back.
        if (c.addAlerts?.length) {
          cache = await store.load()
          return cache
        }
        const dismissed = new Set(c.dismissAlerts)
        cache = {
          version,
          data: c.after,
          meta: { ...state.meta, ...c.meta },
          alerts: state.alerts.map((a) => (dismissed.has(a.id) ? { ...a, dismissed: true } : a)),
        }
        return cache
      }
      throw new ConflictError()
    },
  }
}
