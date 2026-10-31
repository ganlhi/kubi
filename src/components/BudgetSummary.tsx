import type { MonthSummary } from '../domain/budgets'
import { StatusBadge } from './ui'
import { barClass, formatCents, formatRatio } from './format'
import type { BudgetStatus } from '../domain/budgets'

function Gauge({ label, color, spent, budget, ratio, status }: {
  label: string
  color?: string
  spent: number
  budget: number
  ratio: number
  status: BudgetStatus
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        {color && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />}
        <span className="font-medium flex-1 truncate">{label}</span>
        <StatusBadge status={status} />
      </div>
      <div className="h-2 rounded-full bg-stone-200 overflow-hidden">
        <div className={`h-full ${barClass[status]}`} style={{ width: `${Math.min(100, Number.isFinite(ratio) ? ratio * 100 : 100)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-stone-500">
        <span>
          {formatCents(spent)} / {formatCents(budget)}
        </span>
        <span>{formatRatio(ratio)}</span>
      </div>
    </div>
  )
}

/** `bare` drops the card and its title, for the phone's summary sheet. */
export function BudgetSummary({ summary, bare = false }: { summary: MonthSummary; bare?: boolean }) {
  return (
    <div
      className={
        bare
          ? 'flex flex-col gap-4'
          : 'bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4 lg:max-h-[calc(100svh-var(--header-h,0px)-2rem)] lg:overflow-y-auto'
      }
    >
      {!bare && <h2 className="font-semibold">Synthèse</h2>}
      <Gauge
        label="Budget total"
        spent={summary.totalSpentCents}
        budget={summary.totalBudgetCents}
        ratio={summary.totalRatio}
        status={summary.totalStatus}
      />
      {summary.lines.map((l) => (
        <Gauge
          key={l.category.id}
          label={l.category.name}
          color={l.category.color}
          spent={l.spentCents}
          budget={l.budgetCents}
          ratio={l.ratio}
          status={l.status}
        />
      ))}
      <div className="flex justify-between text-sm border-t border-stone-100 pt-3">
        <span>Renflouage</span>
        <span className="font-medium">{formatCents(summary.refloatCents)}</span>
      </div>
      {summary.uncategorizedCount > 0 && (
        <p className="text-sm text-orange-700">
          {summary.uncategorizedCount} opération{summary.uncategorizedCount > 1 ? 's' : ''} non catégorisée
          {summary.uncategorizedCount > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
