import type { MonthSummary } from '../domain/budgets'
import { monthLabel } from '../domain/months'
import { Modal, StatusBadge } from './ui'
import { btn, formatCents, formatRatio } from './format'

/** The end-of-month review shown once per browser when a new month starts. */
export function MonthReviewDialog({ summary, onClose }: { summary: MonthSummary; onClose: () => void }) {
  const over = summary.lines.filter((l) => l.status === 'over')
  return (
    <Modal title={`Bilan de ${monthLabel(summary.month)}`} onClose={onClose}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Budget total</span>
        <span className="flex items-center gap-2">
          {formatCents(summary.totalSpentCents)} / {formatCents(summary.totalBudgetCents)} ({formatRatio(summary.totalRatio)})
          <StatusBadge status={summary.totalStatus} />
        </span>
      </div>
      <p className="text-sm">
        {over.length === 0
          ? 'Tous les budgets ont été respectés. 🎉'
          : `${over.length} budget${over.length > 1 ? 's dépassés' : ' dépassé'} sur ${summary.lines.length}.`}
      </p>
      <ul className="text-sm flex flex-col gap-1">
        {summary.lines.map((l) => (
          <li key={l.category.id} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.category.color }} />
            <span className="flex-1">{l.category.name}</span>
            <span className="text-stone-500">
              {formatCents(l.spentCents)} / {formatCents(l.budgetCents)}
            </span>
            <StatusBadge status={l.status} />
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-sm border-t border-stone-100 pt-3">
        <span>Renflouage</span>
        <span className="font-medium">{formatCents(summary.refloatCents)}</span>
      </div>
      <button className={btn.primary} onClick={onClose}>
        Compris
      </button>
    </Modal>
  )
}
