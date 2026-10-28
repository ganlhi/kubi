import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ALERT_RATIO, summarizeMonth } from '../domain/budgets'
import { addMonths, monthLabel, monthsWithOperations } from '../domain/months'
import type { DataFile, MonthKey } from '../domain/types'
import { formatCents } from './format'

const short = (m: MonthKey) => `${monthLabel(m).slice(0, 4)}. ${m.slice(2, 4)}`
const euros = (cents: number) => Math.round(cents) / 100

export function StatsView({ data, months }: { data: DataFile; months: Map<string, MonthKey> }) {
  const summaries = useMemo(
    () =>
      monthsWithOperations(months)
        .slice(0, 12)
        .reverse()
        .map((m) => summarizeMonth(m, data.operations, months, data.categories)),
    [data, months],
  )
  const capped = data.categories.filter((c) => summaries.some((s) => s.lines.some((l) => l.category.id === c.id)))
  // Margin left, as a share of the budget: positive while within it. None when there is no budget to measure against.
  const margin = (ratio: number) => (Number.isFinite(ratio) ? Math.round((1 - ratio) * 1000) / 10 : null)
  const margins = summaries.map((s) => {
    const row: Record<string, string | number | null> = {
      mois: short(s.month),
      total: margin(s.totalRatio),
      'total:detail': `${formatCents(s.totalSpentCents)} / ${formatCents(s.totalBudgetCents)}`,
    }
    for (const l of s.lines) {
      row[l.category.id] = margin(l.ratio)
      row[`${l.category.id}:detail`] = `${formatCents(l.spentCents)} / ${formatCents(l.budgetCents)}`
    }
    return row
  })
  // Always 12 slots, ending with the latest month, so a bar keeps its width however few months there are.
  const latest = summaries.at(-1)?.month
  const chart = latest
    ? Array.from({ length: 12 }, (_, i) => addMonths(latest, i - 11)).map((m) => {
        const s = summaries.find((x) => x.month === m)
        return s
          ? { mois: short(m), Revenus: euros(s.totalBudgetCents), Consommé: euros(s.totalSpentCents), Renflouage: euros(s.refloatCents) }
          : { mois: short(m) }
      })
    : []

  if (summaries.length === 0) return <p className="text-sm text-stone-500">Pas encore de données.</p>

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold">Respect des budgets</h2>
        <p className="text-xs text-stone-500 mb-3">
          Marge restante en % du budget : au-dessus de 0, respecté ; en dessous, dépassé. La bande orange est la zone d’alerte.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={margins}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <ReferenceArea y1={0} y2={(1 - ALERT_RATIO) * 100} fill="#f97316" fillOpacity={0.1} />
            <ReferenceLine y={0} stroke="#78716c" />
            <XAxis dataKey="mois" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v: number) => `${v} %`} />
            <Tooltip
              formatter={(v, name, item) => {
                const key = String(item.dataKey)
                const detail = (item.payload as Record<string, unknown>)[`${key}:detail`]
                return [`${Number(v) > 0 ? '+' : ''}${v} % (${detail})`, name]
              }}
            />
            <Legend />
            <Line dataKey="total" name="Budget total" stroke="#1c1917" strokeWidth={3} dot={{ r: 3 }} />
            {capped.map((c) => (
              <Line key={c.id} dataKey={c.id} name={c.name} stroke={c.color} strokeWidth={1.5} dot={{ r: 2.5 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold mb-3">Budget total par mois</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mois" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(v) => formatCents(Number(v) * 100)} />
            <Legend />
            <Bar dataKey="Revenus" fill="#10b981" />
            <Bar dataKey="Consommé" fill="#f97316" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold mb-3">Renflouages par mois</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mois" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(v) => formatCents(Number(v) * 100)} />
            <Bar dataKey="Renflouage" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  )
}
