import { useMemo, useState } from 'react'
import { summarizeMonth } from '../domain/budgets'
import { mergeDuplicates, setCategory, setDescription, setMonthOverride, setMonthStart } from '../domain/edits'
import { addMonths, calendarMonth, compareOperations, defaultFlagMonth, monthLabel } from '../domain/months'
import type { DataFile, MonthKey, Operation } from '../domain/types'
import { useKubi } from '../state/store'
import { rankDescriptions } from '../domain/suggest'
import { BudgetSummary } from './BudgetSummary'
import { DescriptionInput } from './DescriptionInput'
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
  const descriptions = useMemo(() => rankDescriptions(data.operations), [data.operations])

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]))

  const picked = selected.map((id) => data.operations.find((o) => o.id === id)).filter((o): o is Operation => !!o)
  const single = picked.length === 1 ? picked[0] : null

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <aside className="w-full lg:w-80 lg:order-2 lg:sticky lg:top-[calc(var(--header-h,0px)+1rem)] shrink-0">
        <BudgetSummary summary={summary} />
      </aside>

      <section className="flex-1 min-w-0 flex flex-col gap-2 w-full">
        {picked.length > 0 && (
          <div className="sticky top-[var(--header-h,0px)] z-30 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {picked.length} opération{picked.length > 1 ? 's' : ''} sélectionnée{picked.length > 1 ? 's' : ''}
            </span>
            <div className="flex flex-wrap gap-2">
              <button className={btn.plain} onClick={() => setSelected([])}>
                Annuler
              </button>
              {single &&
                (single.monthStart ? (
                  <button
                    className={btn.secondary}
                    disabled={readOnly}
                    onClick={() => {
                      mutate((d) => setMonthStart(d, single.id, undefined))
                      setSelected([])
                    }}
                  >
                    Retirer le début de mois
                  </button>
                ) : (
                  <button className={btn.primary} disabled={readOnly} onClick={() => setFlagging(single)}>
                    📅 Démarrer un nouveau mois ici
                  </button>
                ))}
              {picked.length === 2 && (
                <button className={btn.primary} disabled={readOnly} onClick={() => setMerging(true)}>
                  Marquer comme doublons
                </button>
              )}
            </div>
          </div>
        )}
        {operations.length === 0 && <p className="text-stone-500 text-sm p-4">Aucune opération ce mois-ci.</p>}
        {operations.map((op) => (
          <OperationRow
            key={op.id}
            op={op}
            data={data}
            descriptions={descriptions}
            month={months.get(op.id)!}
            selected={selected.includes(op.id)}
            readOnly={readOnly}
            onToggle={() => toggle(op.id)}
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
            setSelected([])
          }}
        />
      )}
      {merging && picked.length === 2 && (
        <MergeDialog
          pair={[picked[0], picked[1]]}
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

function OperationRow({ op, data, descriptions, month, selected, readOnly, onToggle }: {
  op: Operation
  data: DataFile
  descriptions: string[]
  month: MonthKey
  selected: boolean
  readOnly: boolean
  onToggle: () => void
}) {
  const mutate = useKubi((s) => s.mutate)
  const category = data.categories.find((c) => c.id === op.categoryId)
  const own = calendarMonth(op.date)
  const monthChoices = [-1, 0, 1, 2].map((n) => addMonths(own, n))

  // One line when wide enough; otherwise the inputs wrap under the operation.
  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 flex flex-wrap xl:flex-nowrap items-center gap-x-3 gap-y-2 border-l-4 ${selected ? 'ring-2 ring-emerald-500' : ''}`}
      style={{ borderLeftColor: category?.color ?? '#d6d3d1' }}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} title="Sélectionner" />
      <span className="text-sm text-stone-500 w-20 shrink-0">{formatDate(op.date)}</span>
      <span className="text-sm flex-1 min-w-0 truncate" title={op.label}>
        {op.monthStart && (
          <span
            className="text-xs font-medium text-emerald-800 bg-emerald-100 rounded px-1.5 py-0.5 mr-2"
            title={`Début du mois de ${monthLabel(op.monthStart)}`}
          >
            📅 {monthLabel(op.monthStart)}
          </span>
        )}
        {op.label}
      </span>
      <span
        className={`text-sm font-medium whitespace-nowrap text-right xl:w-24 shrink-0 xl:order-last ${op.amountCents >= 0 ? 'text-emerald-700' : ''}`}
      >
        {formatCents(op.amountCents)}
      </span>
      <div className="basis-full xl:basis-auto flex flex-wrap sm:flex-nowrap gap-2 sm:pl-[6.5rem] xl:pl-0">
        <DescriptionInput
          key={`${op.id}:${op.description ?? ''}`}
          value={op.description ?? ''}
          options={descriptions}
          disabled={readOnly}
          onCommit={(value) => mutate((d) => setDescription(d, op.id, value))}
        />
        <select
          className={`${input} sm:!w-44 !w-auto !py-1 ${op.categoryId ? '' : 'italic text-stone-400'}`}
          value={op.categoryId ?? ''}
          disabled={readOnly}
          onChange={(e) => mutate((d) => setCategory(d, op.id, e.target.value || undefined))}
        >
          <option value="">— Catégorie —</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id} className="not-italic text-stone-900">
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={`${input} sm:!w-40 !w-auto !py-1 ${op.monthOverride ? '' : 'italic'}`}
          value={op.monthOverride ?? ''}
          disabled={readOnly}
          title={op.monthOverride ? 'Mois choisi à la main' : 'Mois calculé automatiquement'}
          onChange={(e) => mutate((d) => setMonthOverride(d, op.id, e.target.value || undefined))}
        >
          {/* Shown in italics while the month is the computed one; picked back, it returns to it. */}
          <option value="" className="italic">
            {op.monthOverride ? 'Automatique' : monthLabel(month)}
          </option>
          {monthChoices.map((m) => (
            <option key={m} value={m} className="not-italic">
              {monthLabel(m)}
            </option>
          ))}
        </select>
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
