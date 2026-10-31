import { useMemo, useState } from 'react'
import { summarizeMonth } from '../domain/budgets'
import {
  addTemporary,
  deleteTemporary,
  duplicateCandidates,
  mergeDuplicates,
  setCategory,
  setDescription,
  setMonthOverride,
  setMonthStart,
  type DuplicateCandidate,
} from '../domain/edits'
import { addMonths, calendarMonth, compareOperations, defaultFlagMonth, monthLabel } from '../domain/months'
import type { DataFile, MonthKey, Operation } from '../domain/types'
import { useKubi } from '../state/store'
import { rankDescriptions } from '../domain/suggest'
import { BudgetSummary } from './BudgetSummary'
import { BudgetPeek, MobileOperationList, OperationSheet } from './MobileOperations'
import { CategorySelect } from './CategorySelect'
import { DescriptionInput } from './DescriptionInput'
import { MonthInput } from './MonthInput'
import { Modal } from './ui'
import { useIsMobile } from './useIsMobile'
import { btn, formatCents, formatDate, input, parseEuros, parseFrenchDate } from './format'

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
  const [adding, setAdding] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const mobile = useIsMobile()
  // Phone only: the operation open in a sheet, the summary sheet, and the uncategorized filter it offers.
  const [editing, setEditing] = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [onlyUncategorized, setOnlyUncategorized] = useState(false)

  const operations = useMemo(
    () => data.operations.filter((o) => months.get(o.id) === month).sort(compareOperations).reverse(),
    [data.operations, months, month],
  )
  const summary = useMemo(() => summarizeMonth(month, data.operations, months, data.categories), [month, data, months])
  const descriptions = useMemo(() => rankDescriptions(data.operations), [data.operations])
  // Across all months: the real operation may land in another month than the temporary one.
  const candidates = useMemo(() => duplicateCandidates(data.operations), [data.operations])

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]))

  const picked = selected.map((id) => data.operations.find((o) => o.id === id)).filter((o): o is Operation => !!o)
  const single = picked.length === 1 ? picked[0] : null

  const markDuplicates = () => {
    const [a, b] = picked
    // A temporary operation always gives way to the real one: nothing to ask.
    if (a.temporary !== b.temporary) {
      const [keep, drop] = a.temporary ? [b, a] : [a, b]
      mutate((d) => mergeDuplicates(d, keep.id, drop.id))
      setSelected([])
    } else {
      setMerging(true)
    }
  }

  const selectionLabel = `${picked.length} opération${picked.length > 1 ? 's' : ''} sélectionnée${picked.length > 1 ? 's' : ''}`
  const selectionButtons = (
    <>
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
      {single?.temporary && (
        <button
          className={btn.danger}
          disabled={readOnly}
          onClick={() => {
            mutate((d) => deleteTemporary(d, single.id))
            setSelected([])
          }}
        >
          Supprimer
        </button>
      )}
      {picked.length === 2 && (
        <button className={btn.primary} disabled={readOnly} onClick={markDuplicates}>
          Marquer comme doublons
        </button>
      )}
    </>
  )
  const dialogs = (
    <>
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
      {adding && (
        <TemporaryDialog
          onClose={() => setAdding(false)}
          onAdd={(op) => {
            mutate((d) => addTemporary(d, `temp:${crypto.randomUUID()}`, op))
            setAdding(false)
          }}
        />
      )}
      {suggesting && (
        <SuggestedDuplicatesDialog
          candidates={candidates}
          data={data}
          readOnly={readOnly}
          onClose={() => setSuggesting(false)}
          onMerge={({ real, temporary }) => mutate((d) => mergeDuplicates(d, real.id, temporary.id))}
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
    </>
  )

  if (mobile) {
    // From all operations: one whose month is changed in the sheet leaves this month's list but stays open.
    const editingOp = editing ? data.operations.find((o) => o.id === editing) : undefined
    const shown = onlyUncategorized ? operations.filter((o) => !o.categoryId) : operations
    return (
      <div className="flex flex-col gap-3">
        <BudgetPeek summary={summary} onOpen={() => setShowSummary(true)} />
        {candidates.length > 0 && !readOnly && (
          <button
            className="self-start flex items-center gap-2 rounded-full bg-stone-200 text-stone-800 text-sm font-medium px-3 h-9 cursor-pointer"
            onClick={() => setSuggesting(true)}
          >
            {suggestionLabel(candidates.length)}
          </button>
        )}
        {onlyUncategorized && (
          <button
            className="self-start flex items-center gap-2 rounded-full bg-orange-100 text-orange-900 text-sm font-medium pl-3 pr-2 h-9 cursor-pointer"
            onClick={() => setOnlyUncategorized(false)}
          >
            Sans catégorie uniquement
            <span aria-hidden="true">✕</span>
            <span className="sr-only">(tout afficher)</span>
          </button>
        )}
        {shown.length === 0 && (
          <p className="text-stone-500 text-sm p-4">
            {onlyUncategorized ? 'Toutes les opérations ont une catégorie.' : 'Aucune opération ce mois-ci.'}
          </p>
        )}
        <MobileOperationList
          operations={shown}
          data={data}
          selected={selected}
          onOpen={(op) => setEditing(op.id)}
          onToggle={(op) => toggle(op.id)}
        />
        {picked.length > 0 ? (
          <>
            {/* Room for the action bar, which covers the navigation while selecting. */}
            <div className="h-16" />
            <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-stone-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
              <span className="text-sm font-semibold text-emerald-800">{selectionLabel}</span>
              <div className="flex flex-wrap gap-2 [&_button]:min-h-11">{selectionButtons}</div>
            </div>
          </>
        ) : (
          <button
            aria-label="Ajouter une opération temporaire"
            className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 size-14 rounded-2xl bg-emerald-600 text-white shadow-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
            disabled={readOnly}
            onClick={() => setAdding(true)}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
        {showSummary && (
          <Modal title={`Synthèse · ${monthLabel(month)}`} onClose={() => setShowSummary(false)}>
            <BudgetSummary summary={summary} bare />
            {summary.uncategorizedCount > 0 && (
              <button
                className={`${btn.secondary} min-h-11`}
                onClick={() => {
                  setOnlyUncategorized(true)
                  setShowSummary(false)
                }}
              >
                Afficher les opérations non catégorisées
              </button>
            )}
          </Modal>
        )}
        {editingOp && (
          <Modal title="Opération" onClose={() => setEditing(null)}>
            <OperationSheet
              op={editingOp}
              data={data}
              descriptions={descriptions}
              month={months.get(editingOp.id) ?? month}
              readOnly={readOnly}
              onFlag={() => {
                setEditing(null)
                setFlagging(editingOp)
              }}
              onUnflag={() => mutate((d) => setMonthStart(d, editingOp.id, undefined))}
              onDelete={() => {
                mutate((d) => deleteTemporary(d, editingOp.id))
                setEditing(null)
              }}
              onSelect={() => {
                setSelected([editingOp.id])
                setEditing(null)
              }}
            />
          </Modal>
        )}
        {dialogs}
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <aside className="w-full lg:w-80 lg:order-2 lg:sticky lg:top-[calc(var(--header-h,0px)+1rem)] shrink-0">
        <BudgetSummary summary={summary} />
      </aside>

      <section className="flex-1 min-w-0 flex flex-col gap-2 w-full">
        <div className="flex justify-end gap-2">
          {candidates.length > 0 && (
            <button className={btn.secondary} disabled={readOnly} onClick={() => setSuggesting(true)}>
              {suggestionLabel(candidates.length)}
            </button>
          )}
          <button className={btn.secondary} disabled={readOnly} onClick={() => setAdding(true)}>
            + Opération temporaire
          </button>
        </div>
        {picked.length > 0 && (
          <div className="sticky top-[var(--header-h,0px)] z-30 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{selectionLabel}</span>
            <div className="flex flex-wrap gap-2">
              {selectionButtons}
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

      {dialogs}
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
      style={{
        borderLeftColor: category?.color ?? '#d6d3d1',
        backgroundImage: op.temporary ? 'repeating-linear-gradient(135deg, #f5f5f4 0 6px, #ffffff 6px 12px)' : undefined,
      }}
      title={op.temporary ? 'Opération temporaire : à marquer comme doublon de la vraie quand elle arrivera' : undefined}
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
        {op.temporary && (
          <span className="text-xs font-medium text-stone-600 bg-stone-200 rounded px-1.5 py-0.5 mr-2">Temporaire</span>
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
        <CategorySelect
          categories={data.categories}
          value={op.categoryId}
          disabled={readOnly}
          onChange={(categoryId) => mutate((d) => setCategory(d, op.id, categoryId))}
        />
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
      <div className="text-sm">
        Mois qui démarre
        <MonthInput value={month} onChange={setMonth} />
      </div>
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

function TemporaryDialog({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (op: { date: string; label: string; amountCents: number }) => void
}) {
  // A text field: the native date picker follows the browser's language.
  const [date, setDate] = useState(() => formatDate(new Date().toLocaleDateString('sv-SE')))
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [credit, setCredit] = useState(false)
  const cents = parseEuros(amount)
  const isoDate = parseFrenchDate(date)
  const valid = isoDate !== null && label.trim() !== '' && cents !== null && cents > 0

  return (
    <Modal title="Opération temporaire" onClose={onClose}>
      <p className="text-sm text-stone-600">
        Elle compte dans les budgets tout de suite. Quand la vraie opération sera importée, marquez les deux comme doublons : la
        temporaire disparaîtra.
      </p>
      <label className="text-sm">
        Date
        <input className={`${input} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} placeholder="JJ/MM/AAAA" inputMode="numeric" />
      </label>
      <label className="text-sm">
        Libellé
        <input className={`${input} mt-1`} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </label>
      <div className="flex gap-2 items-end">
        <label className="text-sm flex-1">
          Montant (€)
          <input className={`${input} mt-1`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
        <div className="flex rounded-lg border border-stone-300 overflow-hidden text-sm">
          {[false, true].map((c) => (
            <button key={String(c)} className={`px-3 py-2 ${credit === c ? 'bg-emerald-600 text-white' : 'bg-white'}`} onClick={() => setCredit(c)}>
              {c ? 'Recette' : 'Dépense'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button className={btn.plain} onClick={onClose}>
          Annuler
        </button>
        <button
          className={btn.primary}
          disabled={!valid}
          onClick={() => onAdd({ date: isoDate!, label: label.trim(), amountCents: credit ? cents! : -cents! })}
        >
          Ajouter
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

const suggestionLabel = (n: number) => `${n} doublon${n > 1 ? 's' : ''} possible${n > 1 ? 's' : ''}`

const pairKey = ({ temporary, real }: DuplicateCandidate) => `${temporary.id}|${real.id}`

/** Walks the suggested pairs one at a time; candidates follow the data, so a merge drops the pairs it settles. */
function SuggestedDuplicatesDialog({ candidates, data, readOnly, onClose, onMerge }: {
  candidates: DuplicateCandidate[]
  data: DataFile
  readOnly: boolean
  onClose: () => void
  onMerge: (pair: DuplicateCandidate) => void
}) {
  const [skipped, setSkipped] = useState<string[]>([])
  const remaining = candidates.filter((c) => !skipped.includes(pairKey(c)))
  const current = remaining[0]

  return (
    <Modal title="Doublons possibles" onClose={onClose}>
      {current ? (
        <>
          <p className="text-sm text-stone-600">
            Même montant, et l’opération réelle n’a pas encore de catégorie. Marquée comme doublon, la temporaire disparaît et sa
            description, sa catégorie et son drapeau sont reportés sur la réelle.
          </p>
          <PairCard title="Temporaire" op={current.temporary} data={data} />
          <PairCard title="Réelle" op={current.real} data={data} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-stone-500">
              {remaining.length} paire{remaining.length > 1 ? 's' : ''} à examiner
            </span>
            <div className="flex gap-2">
              <button className={btn.secondary} onClick={() => setSkipped((s) => [...s, pairKey(current)])}>
                Passer
              </button>
              <button className={btn.primary} disabled={readOnly} onClick={() => onMerge(current)}>
                Marquer comme doublon
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-stone-600">Plus aucune paire à examiner.</p>
          <div className="flex justify-end">
            <button className={btn.primary} onClick={onClose}>
              Fermer
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

function PairCard({ title, op, data }: { title: string; op: Operation; data: DataFile }) {
  const category = data.categories.find((c) => c.id === op.categoryId)
  return (
    <div className="border border-stone-200 rounded-lg p-3 border-l-4" style={{ borderLeftColor: category?.color ?? '#d6d3d1' }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</div>
      <div className="text-sm font-medium">{op.label}</div>
      <div className="text-xs text-stone-500">
        {formatDate(op.date)} · {formatCents(op.amountCents)}
        {op.description && ` · ${op.description}`}
        {category && ` · ${category.name}`}
      </div>
    </div>
  )
}
