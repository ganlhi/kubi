import type { BudgetStatus } from '../domain/budgets'

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const formatCents = (cents: number): string => euros.format(cents / 100)

export const formatDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export const formatRatio = (ratio: number): string => (Number.isFinite(ratio) ? `${Math.round(ratio * 100)} %` : '∞')

/** `12,50` → 1250, or null when it is not an amount. */
export function parseEuros(text: string): number | null {
  const cleaned = text.replace(/[\s€]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}

export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const base = 'text-sm font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
export const btn = {
  primary: `${base} bg-emerald-600 hover:bg-emerald-500 text-white`,
  secondary: `${base} border border-stone-300 text-stone-700 hover:bg-stone-100`,
  plain: `${base} text-stone-500 hover:text-stone-800`,
  danger: `${base} bg-red-600 hover:bg-red-500 text-white`,
}
export const input =
  'w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500'

export const statusLabel: Record<BudgetStatus, string> = { ok: 'OK', alert: 'Alerte', over: 'Dépassé' }
export const statusClass: Record<BudgetStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  alert: 'bg-orange-100 text-orange-800',
  over: 'bg-red-100 text-red-800',
}
export const barClass: Record<BudgetStatus, string> = { ok: 'bg-emerald-500', alert: 'bg-orange-500', over: 'bg-red-500' }
