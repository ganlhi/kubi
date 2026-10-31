import type { Category, CategoryKind, DataFile, MonthKey, Operation } from './types'

const updateOp = (data: DataFile, id: string, patch: (op: Operation) => Operation): DataFile => ({
  ...data,
  operations: data.operations.map((op) => (op.id === id ? patch(op) : op)),
})

/**
 * Set an operation's description. An operation without a category takes the
 * one of the latest operation that already carried this description.
 */
export function setDescription(data: DataFile, id: string, description: string): DataFile {
  const text = description.trim()
  const target = data.operations.find((o) => o.id === id)
  if (!target) return data
  let categoryId = target.categoryId
  if (!categoryId && text) {
    const previous = data.operations
      .filter((o) => o.id !== id && o.description === text && o.categoryId)
      .sort((a, b) => b.seq - a.seq)[0]
    categoryId = previous?.categoryId
  }
  return updateOp(data, id, (op) => ({ ...op, description: text || undefined, categoryId }))
}

export const setCategory = (data: DataFile, id: string, categoryId: string | undefined): DataFile =>
  updateOp(data, id, (op) => ({ ...op, categoryId }))

export const setMonthOverride = (data: DataFile, id: string, month: MonthKey | undefined): DataFile =>
  updateOp(data, id, (op) => ({ ...op, monthOverride: month }))

export const setMonthStart = (data: DataFile, id: string, month: MonthKey | undefined): DataFile =>
  updateOp(data, id, (op) => ({ ...op, monthStart: month }))

/** Add an operation by hand, ahead of the bank export that will bring the real one. */
export function addTemporary(
  data: DataFile,
  id: string,
  { date, label, amountCents }: { date: string; label: string; amountCents: number },
): DataFile {
  const op: Operation = { id, date, valueDate: date, label, amountCents, seq: data.nextSeq, temporary: true }
  return { ...data, operations: [...data.operations, op], nextSeq: data.nextSeq + 1 }
}

/** Remove a temporary operation. Imported ones are only ever removed as duplicates. */
export const deleteTemporary = (data: DataFile, id: string): DataFile => ({
  ...data,
  operations: data.operations.filter((o) => !(o.id === id && o.temporary)),
})

/**
 * Merge two operations found to be the same: keep one, drop the other for
 * good, and carry over what the user had set on the dropped one where the
 * kept one has nothing.
 */
export function mergeDuplicates(data: DataFile, keepId: string, dropId: string): DataFile {
  const drop = data.operations.find((o) => o.id === dropId)
  if (!drop || keepId === dropId) return data
  const merged = updateOp(data, keepId, (keep) => ({
    ...keep,
    // A temporary operation's label was typed by hand: it beats the bank's as a description.
    description: keep.description ?? drop.description ?? (drop.temporary ? drop.label : undefined),
    categoryId: keep.categoryId ?? drop.categoryId,
    monthStart: keep.monthStart ?? drop.monthStart,
  }))
  return {
    ...merged,
    operations: merged.operations.filter((o) => o.id !== dropId),
    // A temporary operation can never come back from an import, so there is nothing to ignore.
    ignoredIds: drop.temporary ? merged.ignoredIds : [...merged.ignoredIds, dropId],
  }
}

export interface DuplicateCandidate {
  temporary: Operation
  real: Operation
}

const dayDistance = (a: string, b: string): number => Math.abs(Date.parse(a) - Date.parse(b))

/**
 * Pairs worth merging: a temporary operation and an imported, uncategorised
 * one of the same amount. The pairs of each temporary operation come closest
 * date first, and temporary operations oldest first.
 */
export function duplicateCandidates(operations: Operation[]): DuplicateCandidate[] {
  const reals = operations.filter((o) => !o.temporary && !o.categoryId)
  return operations
    .filter((o) => o.temporary)
    .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)
    .flatMap((temporary) =>
      reals
        .filter((real) => real.amountCents === temporary.amountCents)
        .sort((a, b) => dayDistance(a.date, temporary.date) - dayDistance(b.date, temporary.date) || a.seq - b.seq)
        .map((real) => ({ temporary, real })),
    )
}

export function addCategory(data: DataFile, category: Omit<Category, 'budgets'> & { budgets?: Category['budgets'] }): DataFile {
  return { ...data, categories: [...data.categories, { budgets: [], ...category }] }
}

export function updateCategory(data: DataFile, id: string, patch: Partial<Omit<Category, 'id'>>): DataFile {
  return {
    ...data,
    categories: data.categories.map((c) => {
      if (c.id !== id) return c
      const next = { ...c, ...patch }
      // Only expenses have a cap.
      const kind: CategoryKind = next.kind
      return kind === 'expense' ? next : { ...next, budgets: [] }
    }),
  }
}

export const categoryUsage = (data: DataFile, id: string): number =>
  data.operations.filter((o) => o.categoryId === id).length

/** Delete a category, moving its operations to `reassignTo` (or leaving them uncategorised). */
export function deleteCategory(data: DataFile, id: string, reassignTo: string | undefined): DataFile {
  return {
    ...data,
    categories: data.categories.filter((c) => c.id !== id),
    operations: data.operations.map((o) => (o.categoryId === id ? { ...o, categoryId: reassignTo } : o)),
  }
}

export function authorize(data: DataFile, email: string): DataFile {
  const normalized = email.trim().toLowerCase()
  if (data.authorizedEmails.some((e) => e.toLowerCase() === normalized)) return data
  return { ...data, authorizedEmails: [...data.authorizedEmails, normalized] }
}
