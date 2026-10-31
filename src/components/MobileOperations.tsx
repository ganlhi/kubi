import { useRef } from 'react'
import type { MonthSummary } from '../domain/budgets'
import { setCategory, setDescription, setMonthOverride } from '../domain/edits'
import { addMonths, calendarMonth, MONTH_NAMES, monthLabel } from '../domain/months'
import type { DataFile, MonthKey, Operation } from '../domain/types'
import { useKubi } from '../state/store'
import { CategorySelect } from './CategorySelect'
import { DescriptionInput } from './DescriptionInput'
import { barClass, formatCents, formatDate, formatRatio } from './format'

const LONG_PRESS_MS = 500
const TEMPORARY_STRIPES = 'repeating-linear-gradient(135deg, #f5f5f4 0 6px, #ffffff 6px 12px)'

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/** `septembre` → `sept.`, short enough for a row of five buttons on a phone. */
const shortMonth = (month: MonthKey) => {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1]
  return name.length <= 4 ? name : `${name.slice(0, 4)}.`
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** The month's total budget at a glance; the full summary opens from it. */
export function BudgetPeek({ summary, onOpen }: { summary: MonthSummary; onOpen: () => void }) {
  const over = summary.lines.filter((l) => l.status === 'over').length
  const alert = summary.lines.filter((l) => l.status === 'alert').length
  const ratio = summary.totalRatio
  return (
    <button
      className="w-full bg-white rounded-xl shadow-sm p-4 flex flex-col gap-2.5 text-left cursor-pointer active:bg-stone-50"
      onClick={onOpen}
      aria-label="Voir la synthèse du mois"
    >
      <span className="flex justify-between text-sm font-medium text-stone-600">
        <span>Budget total</span>
        <span>{formatRatio(ratio)}</span>
      </span>
      <span className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-2xl font-bold">{formatCents(summary.totalSpentCents)}</span>
        <span className="text-stone-500">/ {formatCents(summary.totalBudgetCents)}</span>
      </span>
      <span className="h-2 rounded-full bg-stone-200 overflow-hidden">
        <span
          className={`block h-full ${barClass[summary.totalStatus]}`}
          style={{ width: `${Math.min(100, Number.isFinite(ratio) ? ratio * 100 : 100)}%` }}
        />
      </span>
      <span className="flex items-center gap-1.5 flex-wrap text-xs font-semibold">
        {over > 0 && <span className="rounded-full px-2.5 py-1 bg-red-100 text-red-800">{plural(over, 'dépassé')}</span>}
        {alert > 0 && <span className="rounded-full px-2.5 py-1 bg-orange-100 text-orange-800">{alert} en alerte</span>}
        {summary.uncategorizedCount > 0 && (
          <span className="rounded-full px-2.5 py-1 bg-stone-100 text-stone-700">{summary.uncategorizedCount} sans catégorie</span>
        )}
        <span className="flex-1" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth="2.5" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  )
}

/** Operations grouped by day; a tap opens one, a long press starts selecting. */
export function MobileOperationList({ operations, data, selected, onOpen, onToggle }: {
  operations: Operation[]
  data: DataFile
  selected: string[]
  onOpen: (op: Operation) => void
  onToggle: (op: Operation) => void
}) {
  const days: [string, Operation[]][] = []
  for (const op of operations) {
    const last = days.at(-1)
    if (last && last[0] === op.date) last[1].push(op)
    else days.push([op.date, [op]])
  }
  const selecting = selected.length > 0

  return (
    <div className="flex flex-col gap-3">
      {days.map(([date, ops]) => (
        <section key={date}>
          <h3 className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{dayLabel(date)}</h3>
          <ul className="bg-white rounded-xl shadow-sm divide-y divide-stone-100 overflow-hidden">
            {ops.map((op) => (
              <li key={op.id}>
                <MobileRow
                  op={op}
                  data={data}
                  selecting={selecting}
                  selected={selected.includes(op.id)}
                  onOpen={() => onOpen(op)}
                  onToggle={() => onToggle(op)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function MobileRow({ op, data, selecting, selected, onOpen, onToggle }: {
  op: Operation
  data: DataFile
  selecting: boolean
  selected: boolean
  onOpen: () => void
  onToggle: () => void
}) {
  const timer = useRef<number | undefined>(undefined)
  // The click that ends a long press must not also open or toggle the operation.
  const longPressed = useRef(false)
  const category = data.categories.find((c) => c.id === op.categoryId)

  const start = () => {
    longPressed.current = false
    timer.current = window.setTimeout(() => {
      longPressed.current = true
      navigator.vibrate?.(10)
      onToggle()
    }, LONG_PRESS_MS)
  }
  // Also on pointercancel, which the browser sends when the finger starts scrolling.
  const cancel = () => window.clearTimeout(timer.current)

  return (
    <button
      type="button"
      className={`w-full min-h-16 px-4 py-2.5 flex items-center gap-3 text-left select-none [-webkit-touch-callout:none] cursor-pointer ${selected ? 'bg-emerald-50' : 'active:bg-stone-50'}`}
      style={{ backgroundImage: op.temporary ? TEMPORARY_STRIPES : undefined }}
      aria-pressed={selecting ? selected : undefined}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longPressed.current) longPressed.current = false
        else if (selecting) onToggle()
        else onOpen()
      }}
    >
      {selecting && (
        <span
          aria-hidden="true"
          className={`size-5.5 shrink-0 rounded-md border-2 flex items-center justify-center ${selected ? 'bg-emerald-600 border-emerald-600' : 'border-stone-400'}`}
        >
          {selected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round">
              <path d="M5 12l5 5 9-10" />
            </svg>
          )}
        </span>
      )}
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: category?.color ?? '#d6d3d1' }} />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="truncate font-medium">
          {op.monthStart && (
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 rounded px-1.5 py-0.5 mr-1.5">
              Début · {monthLabel(op.monthStart)}
            </span>
          )}
          {op.temporary && <span className="text-xs font-semibold text-stone-600 bg-stone-200 rounded px-1.5 py-0.5 mr-1.5">Temporaire</span>}
          {op.label}
        </span>
        <span className={`truncate text-sm ${category ? 'text-stone-500' : 'text-orange-700'}`}>
          {[category?.name ?? 'Sans catégorie', op.description].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={`font-semibold whitespace-nowrap tabular-nums ${op.amountCents >= 0 ? 'text-emerald-700' : ''}`}>
        {formatCents(op.amountCents)}
      </span>
    </button>
  )
}

const action = 'w-full min-h-12 flex items-center gap-3 px-1 text-left font-medium border-t border-stone-100 cursor-pointer disabled:opacity-50'

/** Everything one does to an operation on a phone, instead of the inline fields of the desktop row. */
export function OperationSheet({ op, data, descriptions, month, readOnly, onFlag, onUnflag, onDelete, onSelect }: {
  op: Operation
  data: DataFile
  descriptions: string[]
  month: MonthKey
  readOnly: boolean
  onFlag: () => void
  onUnflag: () => void
  onDelete: () => void
  onSelect: () => void
}) {
  const mutate = useKubi((s) => s.mutate)
  const own = calendarMonth(op.date)
  const monthChoices = [-1, 0, 1, 2].map((n) => addMonths(own, n))
  const monthOptions: [string, string][] = [
    ['', op.monthOverride ? 'Auto' : `Auto · ${shortMonth(month)}`],
    ...monthChoices.map((m): [string, string] => [m, shortMonth(m)]),
  ]

  return (
    <>
      <div className="flex flex-col gap-1 -mt-2">
        <span className="text-sm text-stone-500">
          {formatDate(op.date)} · valeur {formatDate(op.valueDate)}
        </span>
        <span className="font-semibold break-words">{op.label}</span>
        <span className={`text-3xl font-bold tabular-nums ${op.amountCents >= 0 ? 'text-emerald-700' : ''}`}>
          {formatCents(op.amountCents)}
        </span>
        {op.temporary && <span className="text-xs text-stone-500">Opération temporaire : à marquer comme doublon de la vraie quand elle arrivera.</span>}
      </div>

      <div className="text-sm font-medium text-stone-700 flex flex-col gap-1.5 *:!w-full">
        Description
        <DescriptionInput
          key={`${op.id}:${op.description ?? ''}`}
          value={op.description ?? ''}
          options={descriptions}
          disabled={readOnly}
          onCommit={(value) => mutate((d) => setDescription(d, op.id, value))}
        />
      </div>
      <div className="text-sm font-medium text-stone-700 flex flex-col gap-1.5 *:!w-full">
        Catégorie
        <CategorySelect
          categories={data.categories}
          value={op.categoryId}
          disabled={readOnly}
          onChange={(categoryId) => mutate((d) => setCategory(d, op.id, categoryId))}
        />
      </div>
      <div className="text-sm font-medium text-stone-700 flex flex-col gap-1.5">
        Mois
        <div className="flex gap-1 p-1 bg-stone-100 rounded-xl" role="group" aria-label="Mois de l’opération">
          {monthOptions.map(([value, label]) => {
            const on = (op.monthOverride ?? '') === value
            return (
              <button
                key={value || 'auto'}
                className={`flex-1 h-10 rounded-lg text-sm cursor-pointer disabled:opacity-50 ${value ? '' : 'italic'} ${on ? 'bg-white font-semibold shadow-sm' : 'text-stone-600'}`}
                aria-pressed={on}
                disabled={readOnly}
                onClick={() => !on && mutate((d) => setMonthOverride(d, op.id, value || undefined))}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col">
        {op.monthStart ? (
          <button className={action} disabled={readOnly} onClick={onUnflag}>
            Retirer le début de mois ({monthLabel(op.monthStart)})
          </button>
        ) : (
          <button className={`${action} text-emerald-800`} disabled={readOnly} onClick={onFlag}>
            Démarrer un nouveau mois ici
          </button>
        )}
        <button className={action} onClick={onSelect}>
          Sélectionner pour marquer un doublon
        </button>
        {op.temporary && (
          <button className={`${action} text-red-700`} disabled={readOnly} onClick={onDelete}>
            Supprimer l’opération temporaire
          </button>
        )}
      </div>
    </>
  )
}
