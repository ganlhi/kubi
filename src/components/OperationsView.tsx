import { useMemo, useState } from 'react'
import { summarizeMonth } from '../domain/budgets'
import { mergeDuplicates, setCategory, setDescription, setMonthOverride, setMonthStart } from '../domain/edits'
import { addMonths, calendarMonth, compareOperations, defaultFlagMonth, monthLabel } from '../domain/months'
import type { DataFile, MonthKey, Operation } from '../domain/types'
import { useKubi } from '../state/store'
import { BudgetSummary } from './BudgetSummary'
import { Modal } from './ui'
import { btn, formatCents, formatDate, input } from './format'

interface Props {
  data: DataFile
  months: Map<string, MonthKey>
  month: MonthKey
  readOnly: boolean
}

export function OperationsView({ data, months, month, readOnly }: Props) {
  const mutate = useKubi((s) => s.mutate)
  const [selected, setSelected] = useState<string[]>([])
  const [flagging, setFlagging] = useState<Operation | null>(null)
  const [merging, setMerging] = useState(false)

  const operations = useMemo(
    () => data.operations.filter((o) => months.get(o.id) === month).sort(compareOperations).reverse(),
    [data.operations, months, month],
  )
  const summary = useMemo(() => summarizeMonth(month, data.operations, months, data.categories), [month, data, months])
  const descriptions = useMemo(
    () => [...new Set(data.operations.map((o) => o.description).filter((d): d is string => !!d))].sort(),
    [data.operations],
  )

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]))

  const pair = selected.map((id) => data.operations.find((o) => o.id === id)).filter((o): o is Operation => !!o)

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <aside className="w-full lg:w-80 lg:order-2 lg:sticky lg:top-4 shrink-0">
        <BudgetSummary summary={summary} />
      </aside>

      <section className="flex-1 min-w-0 flex flex-col gap-2 w-full">
        {pair.length === 2 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center justify-between text-sm">
            <span>2 opérations sélectionnées</span>
            <div className="flex gap-2">
              <button className={btn.plain} onClick={() => setSelected([])}>
                Annuler
              </button>
              <button className={btn.primary} disabled={readOnly} onClick={() => setMerging(true)}>
                Marquer comme doublons
              </button>
            </div>
          </div>
        )}
        <datalist id="descriptions">
          {descriptions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        {operations.length === 0 && <p className="text-stone-500 text-sm p-4">Aucune opération ce mois-ci.</p>}
        {operations.map((op) => (
          <OperationRow
            key={op.id}
            op={op}
            data={data}
            month={months.get(op.id)!}
            selected={selected.includes(op.id)}
            readOnly={readOnly}
            onToggle={() => toggle(op.id)}
            onFlag={() => (op.monthStart ? mutate((d) => setMonthStart(d, op.id, undefined)) : setFlagging(op))}
          />
        ))}
      </section>

      {flagging && (
        <FlagDialog
          op={flagging}
          onClose={() => setFlagging(null)}
          onConfirm={(m) => {
            mutate((d) => setMonthStart(d, flagging.id, m))
            setFlagging(null)
          }}
        />
      )}
      {merging && pair.length === 2 && (
        <MergeDialog
          pair={[pair[0], pair[1]]}
          onClose={() => setMerging(false)}
          onKeep={(keep, drop) => {
            mutate((d) => mergeDuplicates(d, keep.id, drop.id))
            setMerging(false)
            setSelected([])
          }}
        />
      )}
    </div>
  )
}

function OperationRow({ op, data, month, selected, readOnly, onToggle, onFlag }: {
  op: Operation
  data: DataFile
  month: MonthKey
  selected: boolean
  readOnly: boolean
  onToggle: () => void
  onFlag: () => void
}) {
  const mutate = useKubi((s) => s.mutate)
  const category = data.categories.find((c) => c.id === op.categoryId)
  const own = calendarMonth(op.date)
  const monthChoices = [-1, 0, 1, 2].map((n) => addMonths(own, n))

  const commitDescription = (value: string) => {
    if (value.trim() !== (op.description ?? '')) mutate((d) => setDescription(d, op.id, value))
  }

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 flex flex-col gap-2 border-l-4 ${selected ? 'ring-2 ring-emerald-500' : ''}`}
      style={{ borderLeftColor: category?.color ?? '#d6d3d1' }}
    >
      {op.monthStart && (
        <div className="text-xs font-medium text-emerald-700">⚑ Début du mois de {monthLabel(op.monthStart)}</div>
      )}
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={selected} onChange={onToggle} title="Sélectionner pour marquer des doublons" />
        <span className="text-sm text-stone-500 w-20 shrink-0">{formatDate(op.date)}</span>
        <span className="text-sm flex-1 min-w-0 break-words">{op.label}</span>
        <span className={`text-sm font-medium whitespace-nowrap ${op.amountCents >= 0 ? 'text-emerald-700' : ''}`}>
          {formatCents(op.amountCents)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 sm:pl-[6.5rem]">
        <input
          key={`${op.id}:${op.description ?? ''}`}
          className={`${input} sm:flex-1 min-w-40 !py-1`}
          list="descriptions"
          placeholder="Description"
          defaultValue={op.description ?? ''}
          disabled={readOnly}
          onBlur={(e) => commitDescription(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <select
          className={`${input} !w-auto !py-1`}
          value={op.categoryId ?? ''}
          disabled={readOnly}
          onChange={(e) => mutate((d) => setCategory(d, op.id, e.target.value || undefined))}
        >
          <option value="">— Catégorie —</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={`${input} !w-auto !py-1`}
          value={op.monthOverride ?? ''}
          disabled={readOnly}
          title="Mois de rattachement"
          onChange={(e) => mutate((d) => setMonthOverride(d, op.id, e.target.value || undefined))}
        >
          <option value="">Auto ({op.monthOverride ? '…' : monthLabel(month)})</option>
          {monthChoices.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <button
          className={op.monthStart ? btn.secondary : btn.plain}
          disabled={readOnly}
          onClick={onFlag}
          title={op.monthStart ? 'Retirer le drapeau de changement de mois' : 'Marquer un changement de mois'}
        >
          ⚑
        </button>
      </div>
    </div>
  )
}

function FlagDialog({ op, onClose, onConfirm }: { op: Operation; onClose: () => void; onConfirm: (month: MonthKey) => void }) {
  const [month, setMonth] = useState(defaultFlagMonth(op.date))
  return (
    <Modal title="Changement de mois" onClose={onClose}>
      <p className="text-sm text-stone-600">
        À partir de « {op.label} » ({formatDate(op.date)}), les opérations datées d’un mois antérieur seront rattachées au mois
        choisi.
      </p>
      <label className="text-sm">
        Mois qui démarre
        <input type="month" className={`${input} mt-1`} value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2">
        <button className={btn.plain} onClick={onClose}>
          Annuler
        </button>
        <button className={btn.primary} disabled={!month} onClick={() => onConfirm(month)}>
          Démarrer {month && monthLabel(month)}
        </button>
      </div>
    </Modal>
  )
}

function MergeDialog({ pair, onClose, onKeep }: {
  pair: [Operation, Operation]
  onClose: () => void
  onKeep: (keep: Operation, drop: Operation) => void
}) {
  return (
    <Modal title="Doublons : quelle opération garder ?" onClose={onClose}>
      <p className="text-sm text-stone-600">
        L’autre sera supprimée et ne sera plus jamais réimportée. Sa description, sa catégorie et son drapeau sont reportés si
        l’opération gardée n’en a pas.
      </p>
      {pair.map((op, i) => (
        <button key={op.id} className="text-left border border-stone-200 rounded-lg p-3 hover:bg-emerald-50" onClick={() => onKeep(op, pair[1 - i])}>
          <div className="text-sm font-medium">{op.label}</div>
          <div className="text-xs text-stone-500">
            {formatDate(op.date)} (valeur {formatDate(op.valueDate)}) · {formatCents(op.amountCents)}
            {op.description && ` · ${op.description}`}
          </div>
        </button>
      ))}
      <button className={btn.plain} onClick={onClose}>
        Annuler
      </button>
    </Modal>
  )
}
