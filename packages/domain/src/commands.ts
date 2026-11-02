/**
 * Every change the app makes to the data, as plain JSON. The browser applies a
 * command to show it at once; the server applies the same one to the stored
 * data, so both run the very same rules.
 */
import { addCategory, addTemporary, deleteCategory, deleteTemporary, mergeDuplicates, setCategory, setDescription, setMonthOverride, setMonthStart, updateCategory } from './edits'
import { addAccountPlan, addFixedItem, deleteAccountPlan, deleteFixedItem, updateAccountPlan, updateFixedItem } from './transfers'
import type { AccountPlan, Category, DataFile, FixedItem, MonthKey } from './types'

/**
 * Optional fields left out mean "unset". JSON drops `undefined`, so a patch
 * that clears a field sends `null` for it instead.
 */
export type Command =
  | { type: 'setDescription'; id: string; description: string }
  | { type: 'setCategory'; id: string; categoryId?: string | null }
  | { type: 'setMonthOverride'; id: string; month?: MonthKey | null }
  | { type: 'setMonthStart'; id: string; month?: MonthKey | null }
  | { type: 'addTemporary'; id: string; date: string; label: string; amountCents: number }
  | { type: 'deleteTemporary'; id: string }
  | { type: 'mergeDuplicates'; keepId: string; dropId: string }
  | { type: 'addCategory'; category: Category }
  | { type: 'updateCategory'; category: Category }
  | { type: 'deleteCategory'; id: string; reassignTo?: string | null }
  | { type: 'addAccountPlan'; id: string; name: string }
  | { type: 'updateAccountPlan'; id: string; patch: Nullable<Partial<Omit<AccountPlan, 'id' | 'items'>>> }
  | { type: 'deleteAccountPlan'; id: string }
  | { type: 'addFixedItem'; planId: string; item: FixedItem }
  | { type: 'updateFixedItem'; planId: string; itemId: string; patch: Partial<Omit<FixedItem, 'id'>> }
  | { type: 'deleteFixedItem'; planId: string; itemId: string }

type Nullable<T> = { [K in keyof T]: T[K] | null }

const orUndefined = <T>(value: T | null | undefined): T | undefined => value ?? undefined

/** `null` fields back to `undefined`, the way the data stores an unset field. */
const unsetNulls = <T extends object>(patch: Nullable<T>): T =>
  Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? undefined])) as T

export function applyCommand(data: DataFile, cmd: Command): DataFile {
  switch (cmd.type) {
    case 'setDescription':
      return setDescription(data, cmd.id, cmd.description)
    case 'setCategory':
      return setCategory(data, cmd.id, orUndefined(cmd.categoryId))
    case 'setMonthOverride':
      return setMonthOverride(data, cmd.id, orUndefined(cmd.month))
    case 'setMonthStart':
      return setMonthStart(data, cmd.id, orUndefined(cmd.month))
    case 'addTemporary':
      return addTemporary(data, cmd.id, cmd)
    case 'deleteTemporary':
      return deleteTemporary(data, cmd.id)
    case 'mergeDuplicates':
      return mergeDuplicates(data, cmd.keepId, cmd.dropId)
    case 'addCategory':
      return addCategory(data, cmd.category)
    case 'updateCategory':
      return updateCategory(data, cmd.category.id, cmd.category)
    case 'deleteCategory':
      return deleteCategory(data, cmd.id, orUndefined(cmd.reassignTo))
    case 'addAccountPlan':
      return addAccountPlan(data, cmd.id, cmd.name)
    case 'updateAccountPlan':
      return updateAccountPlan(data, cmd.id, (p) => ({ ...p, ...unsetNulls(cmd.patch) }))
    case 'deleteAccountPlan':
      return deleteAccountPlan(data, cmd.id)
    case 'addFixedItem':
      return addFixedItem(data, cmd.planId, cmd.item)
    case 'updateFixedItem':
      return updateFixedItem(data, cmd.planId, cmd.itemId, cmd.patch)
    case 'deleteFixedItem':
      return deleteFixedItem(data, cmd.planId, cmd.itemId)
  }
}

const COMMAND_TYPES = new Set<string>([
  'setDescription', 'setCategory', 'setMonthOverride', 'setMonthStart', 'addTemporary', 'deleteTemporary',
  'mergeDuplicates', 'addCategory', 'updateCategory', 'deleteCategory', 'addAccountPlan', 'updateAccountPlan',
  'deleteAccountPlan', 'addFixedItem', 'updateFixedItem', 'deleteFixedItem',
] satisfies Command['type'][])

/** A first check on a command received as JSON; the handlers ignore IDs that do not exist. */
export const isCommand = (value: unknown): value is Command =>
  typeof value === 'object' && value !== null && COMMAND_TYPES.has((value as { type?: unknown }).type as string)
