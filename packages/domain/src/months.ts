import type { MonthKey, Operation } from './types'

export const calendarMonth = (date: string): MonthKey => date.slice(0, 7)

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** Default month started by a flag on `date`: the next one late in the month, the same one early on. */
export const defaultFlagMonth = (date: string): MonthKey =>
  Number(date.slice(8, 10)) > 15 ? addMonths(calendarMonth(date), 1) : calendarMonth(date)

export const compareOperations = (a: Operation, b: Operation): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq

/**
 * The month each operation belongs to. Walking in order, a flag starts its
 * month; every later operation dated in an earlier month joins it, while one
 * dated later keeps its own. A month set by hand wins over all of that.
 */
export function assignMonths(operations: Operation[]): Map<string, MonthKey> {
  const months = new Map<string, MonthKey>()
  let active: MonthKey | undefined
  for (const op of [...operations].sort(compareOperations)) {
    if (op.monthStart && (!active || op.monthStart > active)) active = op.monthStart
    const own = calendarMonth(op.date)
    const ruled = active && active > own ? active : own
    months.set(op.id, op.monthOverride ?? ruled)
  }
  return months
}

/** Every month that has operations, newest first. */
export function monthsWithOperations(months: Map<string, MonthKey>): MonthKey[] {
  return [...new Set(months.values())].sort().reverse()
}
