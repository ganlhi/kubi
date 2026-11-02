/**
 * The store in memory, document by document like Firestore, so tests and local
 * development go through the same diffs. Lost on restart.
 */
import type { AccountPlan, Category, Operation } from '@kubi/domain/types'
import { assembleData, diffData, normalizeEmail, type Alert, type Meta, type Positioned, type Store, type Writes } from './store'

const apply = <T>(target: Map<string, T>, writes: Writes<T>) => {
  for (const [k, v] of writes) {
    if (v === null) target.delete(k)
    else target.set(k, structuredClone(v))
  }
}

export function createMemoryStore(): Store {
  let version = 0
  const config: { accountNumber?: string | null; nextSeq: number } = { nextSeq: 0 }
  let meta: Meta = { folder: null, lastImport: null }
  const operations = new Map<string, Operation>()
  const categories = new Map<string, Positioned<Category>>()
  const ignoredIds = new Map<string, { id: string }>()
  const accountPlans = new Map<string, Positioned<AccountPlan>>()
  const alerts = new Map<string, Alert>()
  const members = new Map<string, string>()
  let lock: { owner: string; expiresAt: number } | null = null
  let nextAlert = 0

  return {
    version: async () => version,

    load: async () =>
      structuredClone({
        version,
        meta,
        alerts: [...alerts.values()].sort((a, b) => a.at - b.at),
        data: assembleData({
          ...config,
          operations: [...operations.values()],
          categories: [...categories.values()],
          ignoredIds: [...ignoredIds.values()].map((x) => x.id),
          accountPlans: [...accountPlans.values()],
        }),
      }),

    commit: async (expected, change) => {
      if (expected !== version) return null
      const diff = diffData(change.before, change.after)
      apply(operations, diff.operations)
      apply(categories, diff.categories)
      apply(ignoredIds, diff.ignoredIds)
      apply(accountPlans, diff.accountPlans)
      Object.assign(config, diff.config)
      if (change.meta) meta = { ...meta, ...structuredClone(change.meta) }
      for (const a of change.addAlerts ?? []) {
        const id = `a${nextAlert++}`
        alerts.set(id, { id, ...a, dismissed: false })
      }
      for (const id of change.dismissAlerts ?? []) {
        const a = alerts.get(id)
        if (a) a.dismissed = true
      }
      return ++version
    },

    members: async () => [...members.keys()].sort(),
    isMember: async (email) => members.has(normalizeEmail(email)),
    addMember: async (email, addedBy) => {
      members.set(normalizeEmail(email), addedBy)
    },
    removeMember: async (email) => {
      members.delete(normalizeEmail(email))
    },

    acquireLock: async (owner, now, ttlMs) => {
      if (lock && lock.owner !== owner && lock.expiresAt > now) return false
      lock = { owner, expiresAt: now + ttlMs }
      return true
    },
    releaseLock: async (owner) => {
      if (lock?.owner === owner) lock = null
    },
  }
}
