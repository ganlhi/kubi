import type { Category, MonthKey, Operation } from './types'

export type BudgetStatus = 'ok' | 'alert' | 'over'

export const ALERT_RATIO = 0.8

export function budgetStatus(spentCents: number, budgetCents: number): BudgetStatus {
  if (spentCents > budgetCents) return 'over'
  if (spentCents > budgetCents * ALERT_RATIO) return 'alert'
  return 'ok'
}

/** The cap in force for `month`, or null when there is none. */
export function budgetFor(category: Category, month: MonthKey): number | null {
  let cap: number | null = null
  for (const b of category.budgets) if (b.from <= month) cap = b.amountCents
  return cap
}

/** Set the cap from `month` on, leaving earlier months as they were. */
export function withBudgetFrom(category: Category, month: MonthKey, amountCents: number | null): Category {
  const budgets = [...category.budgets.filter((b) => b.from !== month), { from: month, amountCents }]
  budgets.sort((a, b) => (a.from < b.from ? -1 : 1))
  return { ...category, budgets }
}

export interface CategoryBudgetLine {
  category: Category
  /** Net spent: debits minus refunds. */
  spentCents: number
  budgetCents: number
  ratio: number
  status: BudgetStatus
}

export interface MonthSummary {
  month: MonthKey
  lines: CategoryBudgetLine[]
  /** Sum of operations in income categories. */
  totalBudgetCents: number
  /** Net spent by everything that is neither income nor refloat, uncategorised included. */
  totalSpentCents: number
  totalRatio: number
  totalStatus: BudgetStatus
  refloatCents: number
  uncategorizedCount: number
}

export function summarizeMonth(
  month: MonthKey,
  operations: Operation[],
  months: Map<string, MonthKey>,
  categories: Category[],
): MonthSummary {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const spentByCategory = new Map<string, number>()
  let totalBudgetCents = 0
  let totalSpentCents = 0
  let refloatCents = 0
  let uncategorizedCount = 0

  for (const op of operations) {
    if (months.get(op.id) !== month) continue
    const category = op.categoryId ? byId.get(op.categoryId) : undefined
    if (!category) uncategorizedCount++
    if (category?.kind === 'income') {
      totalBudgetCents += op.amountCents
    } else if (category?.kind === 'refloat') {
      refloatCents += op.amountCents
    } else {
      totalSpentCents -= op.amountCents
      if (category) spentByCategory.set(category.id, (spentByCategory.get(category.id) ?? 0) - op.amountCents)
    }
  }

  const lines: CategoryBudgetLine[] = []
  for (const category of categories) {
    if (category.kind !== 'expense') continue
    const budgetCents = budgetFor(category, month)
    if (budgetCents === null) continue
    const spentCents = spentByCategory.get(category.id) ?? 0
    lines.push({
      category,
      spentCents,
      budgetCents,
      ratio: budgetCents > 0 ? spentCents / budgetCents : spentCents > 0 ? Infinity : 0,
      status: budgetStatus(spentCents, budgetCents),
    })
  }

  return {
    month,
    lines,
    totalBudgetCents,
    totalSpentCents,
    totalRatio: totalBudgetCents > 0 ? totalSpentCents / totalBudgetCents : totalSpentCents > 0 ? Infinity : 0,
    totalStatus: budgetStatus(totalSpentCents, totalBudgetCents),
    refloatCents,
    uncategorizedCount,
  }
}
