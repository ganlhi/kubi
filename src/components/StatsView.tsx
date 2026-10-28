import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { summarizeMonth } from '../domain/budgets'
import { monthLabel, monthsWithOperations } from '../domain/months'
import type { DataFile, MonthKey } from '../domain/types'
import { formatCents, formatRatio, statusClass } from './format'

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
  const chart = summaries.map((s) => ({
    mois: short(s.month),
    Revenus: euros(s.totalBudgetCents),
    Consommé: euros(s.totalSpentCents),
    Renflouage: euros(s.refloatCents),
  }))

  if (summaries.length === 0) return <p className="text-sm text-stone-500">Pas encore de données.</p>

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-white rounded-xl shadow-sm p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Respect des budgets</h2>
        <table className="text-sm border-separate border-spacing-1">
          <thead>
            <tr>
              <th />
              {summaries.map((s) => (
                <th key={s.month} className="font-normal text-stone-500 px-1 whitespace-nowrap">
                  {short(s.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="pr-2 font-medium whitespace-nowrap">Budget total</td>
              {summaries.map((s) => (
                <td key={s.month} className={`text-center rounded px-1 ${statusClass[s.totalStatus]}`} title={`${formatCents(s.totalSpentCents)} / ${formatCents(s.totalBudgetCents)}`}>
                  {formatRatio(s.totalRatio)}
                </td>
              ))}
            </tr>
            {capped.map((c) => (
              <tr key={c.id}>
                <td className="pr-2 whitespace-nowrap">
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: c.color }} />
                  {c.name}
                </td>
                {summaries.map((s) => {
                  const line = s.lines.find((l) => l.category.id === c.id)
                  return line ? (
                    <td key={s.month} className={`text-center rounded px-1 ${statusClass[line.status]}`} title={`${formatCents(line.spentCents)} / ${formatCents(line.budgetCents)}`}>
                      {formatRatio(line.ratio)}
                    </td>
                  ) : (
                    <td key={s.month} className="text-center text-stone-300">—</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
