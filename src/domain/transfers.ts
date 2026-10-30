import type { AccountPlan, DataFile, FixedItem } from './types'

/** Net fixed expenses: debits count up, credits count down. */
export const fixedTotal = (items: FixedItem[]): number =>
  items.reduce((sum, i) => sum + (i.direction === 'debit' ? i.amountCents : -i.amountCents), 0)

/** What can leave the account once the reserve and the fixed expenses are covered; negative when short. */
export const toTransfer = (plan: AccountPlan): number =>
  (plan.balanceCents ?? 0) - (plan.reserveCents ?? 0) - fixedTotal(plan.items)

export const accountPlans = (data: DataFile): AccountPlan[] => data.accountPlans ?? []

export const addAccountPlan = (data: DataFile, id: string, name: string): DataFile => ({
  ...data,
  accountPlans: [...accountPlans(data), { id, name, items: [] }],
})

export const updateAccountPlan = (data: DataFile, id: string, patch: (plan: AccountPlan) => AccountPlan): DataFile => ({
  ...data,
  accountPlans: accountPlans(data).map((p) => (p.id === id ? patch(p) : p)),
})

export const deleteAccountPlan = (data: DataFile, id: string): DataFile => ({
  ...data,
  accountPlans: accountPlans(data).filter((p) => p.id !== id),
})

export const addFixedItem = (data: DataFile, planId: string, item: FixedItem): DataFile =>
  updateAccountPlan(data, planId, (p) => ({ ...p, items: [...p.items, item] }))

export const updateFixedItem = (data: DataFile, planId: string, itemId: string, patch: Partial<Omit<FixedItem, 'id'>>): DataFile =>
  updateAccountPlan(data, planId, (p) => ({ ...p, items: p.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }))

export const deleteFixedItem = (data: DataFile, planId: string, itemId: string): DataFile =>
  updateAccountPlan(data, planId, (p) => ({ ...p, items: p.items.filter((i) => i.id !== itemId) }))
