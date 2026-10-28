import { useState } from 'react'
import { budgetFor, withBudgetFrom } from '../domain/budgets'
import { suggestColor } from '../domain/colors'
import { addCategory, categoryUsage, deleteCategory, updateCategory } from '../domain/edits'
import { monthLabel } from '../domain/months'
import type { Category, CategoryKind, DataFile, MonthKey } from '../domain/types'
import { useKubi } from '../state/store'
import { Modal } from './ui'
import { btn, formatCents, input, parseEuros } from './format'

const KIND_LABEL: Record<CategoryKind, string> = {
  expense: 'Dépense',
  income: 'Participe au budget total',
  refloat: 'Renflouage',
}

export function CategoriesView({ data, month, readOnly }: { data: DataFile; month: MonthKey; readOnly: boolean }) {
  const mutate = useKubi((s) => s.mutate)
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  return (
    <div className="max-w-2xl flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold">Catégories</h2>
        <button className={btn.primary} disabled={readOnly} onClick={() => setEditing('new')}>
          Nouvelle catégorie
        </button>
      </div>
      {data.categories.length === 0 && <p className="text-sm text-stone-500">Aucune catégorie pour l’instant.</p>}
      {data.categories.map((c) => {
        const cap = c.kind === 'expense' ? budgetFor(c, month) : null
        return (
          <div key={c.id} className="bg-white rounded-lg shadow-sm p-3 flex items-center gap-3">
            <span className="w-4 h-4 rounded-full shrink-0" style={{ background: c.color }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-stone-500">
                {KIND_LABEL[c.kind]}
                {cap !== null && ` · ${formatCents(cap)} / mois en ${monthLabel(month)}`}
              </div>
            </div>
            <button className={btn.secondary} disabled={readOnly} onClick={() => setEditing(c)}>
              Modifier
            </button>
            <button className={btn.plain} disabled={readOnly} onClick={() => setDeleting(c)}>
              Supprimer
            </button>
          </div>
        )
      })}

      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          existing={data.categories}
          month={month}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            mutate((d) => (editing === 'new' ? addCategory(d, c) : updateCategory(d, c.id, c)))
            setEditing(null)
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          category={deleting}
          data={data}
          onClose={() => setDeleting(null)}
          onConfirm={(reassignTo) => {
            mutate((d) => deleteCategory(d, deleting.id, reassignTo))
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

function CategoryDialog({ category, existing, month, onClose, onSave }: {
  category: Category | null
  existing: Category[]
  month: MonthKey
  onClose: () => void
  onSave: (c: Category) => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? suggestColor(existing.map((c) => c.color)))
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? 'expense')
  const current = category ? budgetFor(category, month) : null
  const [cap, setCap] = useState(current === null ? '' : String(current / 100).replace('.', ','))
  const [from, setFrom] = useState(month)

  const capCents = cap.trim() === '' ? null : parseEuros(cap)
  const capInvalid = cap.trim() !== '' && capCents === null
  const duplicate = existing.some((c) => c.id !== category?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase())

  const submit = () => {
    let next: Category = { id: category?.id ?? crypto.randomUUID(), name: name.trim(), color, kind, budgets: category?.budgets ?? [] }
    if (kind === 'expense' && capCents !== current) next = withBudgetFrom(next, from, capCents)
    onSave(next)
  }

  return (
    <Modal title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'} onClose={onClose}>
      <label className="text-sm">
        Nom
        <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      {duplicate && <p className="text-xs text-red-600">Une catégorie porte déjà ce nom.</p>}
      <label className="text-sm flex items-center gap-2">
        Couleur
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <fieldset className="text-sm flex flex-col gap-1">
        <legend className="mb-1">Type</legend>
        {(Object.keys(KIND_LABEL) as CategoryKind[]).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" checked={kind === k} onChange={() => setKind(k)} />
            {KIND_LABEL[k]}
          </label>
        ))}
      </fieldset>
      {kind === 'expense' && (
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="text-sm flex-1">
            Budget mensuel (€, vide = aucun)
            <input className={`${input} mt-1`} value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" />
          </label>
          <label className="text-sm flex-1">
            À partir de
            <input type="month" className={`${input} mt-1`} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
        </div>
      )}
      {capInvalid && <p className="text-xs text-red-600">Montant invalide.</p>}
      <div className="flex justify-end gap-2">
        <button className={btn.plain} onClick={onClose}>
          Annuler
        </button>
        <button className={btn.primary} disabled={!name.trim() || duplicate || capInvalid || !from} onClick={submit}>
          Enregistrer
        </button>
      </div>
    </Modal>
  )
}

function DeleteDialog({ category, data, onClose, onConfirm }: {
  category: Category
  data: DataFile
  onClose: () => void
  onConfirm: (reassignTo: string | undefined) => void
}) {
  const usage = categoryUsage(data, category.id)
  const [target, setTarget] = useState('')
  return (
    <Modal title={`Supprimer « ${category.name} »`} onClose={onClose}>
      {usage > 0 ? (
        <label className="text-sm">
          {usage} opération{usage > 1 ? 's utilisent' : ' utilise'} cette catégorie. Les réassigner à :
          <select className={`${input} mt-1`} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— Aucune catégorie —</option>
            {data.categories
              .filter((c) => c.id !== category.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-stone-600">Aucune opération n’utilise cette catégorie.</p>
      )}
      <div className="flex justify-end gap-2">
        <button className={btn.plain} onClick={onClose}>
          Annuler
        </button>
        <button className={btn.danger} onClick={() => onConfirm(target || undefined)}>
          Supprimer
        </button>
      </div>
    </Modal>
  )
}
