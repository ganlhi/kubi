/**
 * Where the data lives, behind one small interface: Firestore in production,
 * memory in tests and local development.
 *
 * The app thinks in whole `DataFile`s, as it did when the data was one JSON
 * file; the store keeps one document per operation, category, ignored ID and
 * account plan. `diffData` bridges the two: it turns "the data before" and
 * "the data after" into the few documents to write or delete.
 *
 * Every write bumps a single version counter, checked in the same transaction:
 * a write based on stale data is refused, and the caller retries on fresh data.
 */
import { createHash } from 'node:crypto'
import type { AccountPlan, Category, DataFile, Operation } from '@kubi/domain/types'
import type { DriveFolder } from './driveClient'

export interface Meta {
  folder: DriveFolder | null
  lastImport: { at: number; added: number } | null
}

export interface Alert {
  id: string
  message: string
  at: number
  /** Kept once dismissed, so the same alert is not raised again at the next scan. */
  dismissed: boolean
}

export interface State {
  version: number
  data: DataFile
  meta: Meta
  alerts: Alert[]
}

export interface Change {
  before: DataFile
  after: DataFile
  meta?: Partial<Meta>
  addAlerts?: { message: string; at: number }[]
  dismissAlerts?: string[]
}

export interface Store {
  version(): Promise<number>
  /** Everything, read consistently. */
  load(): Promise<State>
  /** Apply `change` if the version is still `expected`; the new version, or null if someone wrote first. */
  commit(expected: number, change: Change): Promise<number | null>

  members(): Promise<string[]>
  isMember(email: string): Promise<boolean>
  addMember(email: string, addedBy: string): Promise<void>
  removeMember(email: string): Promise<void>

  /** Take the import lock for `owner` unless another owner holds a live one. */
  acquireLock(owner: string, now: number, ttlMs: number): Promise<boolean>
  releaseLock(owner: string): Promise<void>
}

/** Operation IDs hold `/` at times, which Firestore forbids in a document ID. */
export const docId = (id: string): string => createHash('sha256').update(id).digest('hex').slice(0, 40)

/** JSON with sorted keys and no `undefined`, so equal values always compare equal. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )
}

/** A document to write, or null to delete it. */
export type Writes<T> = Map<string, T | null>

/** Categories and plans keep their order through `pos`. */
export type Positioned<T> = T & { pos: number }

export interface DataDiff {
  operations: Writes<Operation>
  categories: Writes<Positioned<Category>>
  ignoredIds: Writes<{ id: string }>
  accountPlans: Writes<Positioned<AccountPlan>>
  /** Fields of the config document to set; `accountNumber: null` clears it. */
  config: { accountNumber?: string | null; nextSeq?: number }
}

/**
 * The documents that differ between two lists. The domain keeps an unchanged
 * item as the very same object, which spares comparing thousands of operations;
 * `positional` documents also change when their index does.
 */
function diffById<T, D>(before: T[], after: T[], key: (item: T) => string, toDoc: (item: T, index: number) => D, positional = false): Writes<D> {
  const writes: Writes<D> = new Map()
  const old = new Map(before.map((item, i) => [key(item), { item, i }]))
  after.forEach((item, i) => {
    const k = key(item)
    const prev = old.get(k)
    old.delete(k)
    if (prev && prev.item === item && (!positional || prev.i === i)) return
    const doc = toDoc(item, i)
    if (prev && stableJson(toDoc(prev.item, prev.i)) === stableJson(doc)) return
    writes.set(k, doc)
  })
  for (const k of old.keys()) writes.set(k, null)
  return writes
}

export function diffData(before: DataFile, after: DataFile): DataDiff {
  const config: DataDiff['config'] = {}
  if (before.accountNumber !== after.accountNumber) config.accountNumber = after.accountNumber ?? null
  if (before.nextSeq !== after.nextSeq) config.nextSeq = after.nextSeq
  const ignored = (ids: string[]) => ids.map((id) => ({ id }))
  return {
    operations: before.operations === after.operations ? new Map() : diffById(before.operations, after.operations, (o) => docId(o.id), (o) => o),
    categories: diffById(before.categories, after.categories, (c) => c.id, (c, pos) => ({ ...c, pos }), true),
    ignoredIds:
      before.ignoredIds === after.ignoredIds ? new Map() : diffById(ignored(before.ignoredIds), ignored(after.ignoredIds), (x) => docId(x.id), (x) => x),
    accountPlans: diffById(before.accountPlans ?? [], after.accountPlans ?? [], (p) => p.id, (p, pos) => ({ ...p, pos }), true),
    config,
  }
}

export const isEmptyDiff = (d: DataDiff): boolean =>
  d.operations.size + d.categories.size + d.ignoredIds.size + d.accountPlans.size === 0 && Object.keys(d.config).length === 0

const byPos = <T extends { pos: number }>(items: T[]): Omit<T, 'pos'>[] =>
  [...items].sort((a, b) => a.pos - b.pos).map((item) => {
    const rest: Omit<T, 'pos'> & { pos?: number } = { ...item }
    delete rest.pos
    return rest
  })

/** The `DataFile` back from its documents, in the order the app expects. */
export function assembleData(parts: {
  accountNumber?: string | null
  nextSeq: number
  operations: Operation[]
  categories: Positioned<Category>[]
  ignoredIds: string[]
  accountPlans: Positioned<AccountPlan>[]
}): DataFile {
  return {
    schema: 1,
    ...(parts.accountNumber ? { accountNumber: parts.accountNumber } : {}),
    categories: byPos(parts.categories) as Category[],
    operations: [...parts.operations].sort((a, b) => a.seq - b.seq),
    ignoredIds: [...parts.ignoredIds].sort(),
    nextSeq: parts.nextSeq,
    accountPlans: byPos(parts.accountPlans) as AccountPlan[],
  }
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()
