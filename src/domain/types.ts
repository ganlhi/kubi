/** A budget month, as `YYYY-MM`. */
export type MonthKey = string

export interface Operation {
  id: string
  /** `YYYY-MM-DD`, from "Date Opération". */
  date: string
  /** `YYYY-MM-DD`, from "Date Valeur". */
  valueDate: string
  label: string
  /** In cents, negative for a debit. From the first "Solde" column. */
  amountCents: number
  /** Chronological order of import; orders operations sharing a date. */
  seq: number
  description?: string
  categoryId?: string
  /** Month set by hand; wins over the month-change rule. */
  monthOverride?: MonthKey
  /** Set when this operation carries the "Changement de mois" flag: the month it starts. */
  monthStart?: MonthKey
  /** Entered by hand ahead of the bank export, to be merged into the real one once it arrives. */
  temporary?: true
}

export type CategoryKind = 'expense' | 'income' | 'refloat'

export interface BudgetPeriod {
  /** First month this cap applies to. */
  from: MonthKey
  /** Null removes the cap from that month on. */
  amountCents: number | null
}

export interface Category {
  id: string
  name: string
  /** `#rrggbb`. */
  color: string
  /** `income` counts toward the total budget; `refloat` is shown apart. */
  kind: CategoryKind
  /** Caps, oldest first. Only meaningful for `expense`. */
  budgets: BudgetPeriod[]
}

export interface DataFile {
  schema: 1
  authorizedEmails: string[]
  /** The single bank account imports are accepted from, once known. */
  accountNumber?: string
  categories: Category[]
  operations: Operation[]
  /** Operations merged away as duplicates: never re-imported. */
  ignoredIds: string[]
  nextSeq: number
  /** Transfer planning, unrelated to operations; absent from files written before it existed. */
  accountPlans?: AccountPlan[]
}

/** A recurring amount, always positive; `direction` says which way it moves. */
export interface FixedItem {
  id: string
  name: string
  amountCents: number
  direction: 'debit' | 'credit'
}

/** One account to split money from: its fixed expenses, current balance and the reserve to keep. */
export interface AccountPlan {
  id: string
  name: string
  items: FixedItem[]
  balanceCents?: number
  reserveCents?: number
}

export const emptyDataFile = (email: string): DataFile => ({
  schema: 1,
  authorizedEmails: [email],
  categories: [],
  operations: [],
  ignoredIds: [],
  nextSeq: 0,
})
