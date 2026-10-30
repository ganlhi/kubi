import { useState } from 'react'
import {
  accountPlans,
  addAccountPlan,
  addFixedItem,
  deleteAccountPlan,
  deleteFixedItem,
  fixedTotal,
  toTransfer,
  updateAccountPlan,
  updateFixedItem,
} from '../domain/transfers'
import type { AccountPlan, DataFile, FixedItem } from '../domain/types'
import { useKubi } from '../state/store'
import { Modal } from './ui'
import { btn, formatCents, input, parseEuros, parseSignedEuros } from './format'

const centsText = (cents: number | undefined): string => (cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','))

/**
 * An amount saved when the field is left, so typing does not write to Drive on
 * every key. Remounted (by its key) whenever the saved value changes.
 */
function AmountField({
  cents,
  onCommit,
  signed = false,
  disabled,
  placeholder,
  className = '',
}: {
  cents: number | undefined
  onCommit: (cents: number | undefined) => void
  signed?: boolean
  disabled: boolean
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(centsText(cents))
  const commit = () => {
    if (text.trim() === '') return cents !== undefined && onCommit(undefined)
    const parsed = (signed ? parseSignedEuros : parseEuros)(text)
    if (parsed === null) return setText(centsText(cents))
    if (parsed !== cents) onCommit(parsed)
  }
  return (
    <input
      className={`${input} text-right tabular-nums ${className}`}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function TextField({ value, onCommit, disabled, className = '' }: { value: string; onCommit: (v: string) => void; disabled: boolean; className?: string }) {
  const [text, setText] = useState(value)
  return (
    <input
      className={`${input} ${className}`}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const trimmed = text.trim()
        if (!trimmed) setText(value)
        else if (trimmed !== value) onCommit(trimmed)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

export function TransfersView({ data, readOnly }: { data: DataFile; readOnly: boolean }) {
  const mutate = useKubi((s) => s.mutate)
  const plans = accountPlans(data)
  const [deleting, setDeleting] = useState<AccountPlan | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center max-w-2xl">
        <h2 className="font-semibold">Répartition entre comptes</h2>
        <button
          className={btn.primary}
          disabled={readOnly}
          onClick={() => mutate((d) => addAccountPlan(d, crypto.randomUUID(), `Compte ${accountPlans(d).length + 1}`))}
        >
          Ajouter un compte
        </button>
      </div>
      {plans.length === 0 && <p className="text-sm text-stone-500">Aucun compte pour l’instant.</p>}
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,26rem),1fr))] items-start">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} readOnly={readOnly} onDelete={() => setDeleting(plan)} />
        ))}
      </div>

      {deleting && (
        <Modal title={`Supprimer « ${deleting.name} » ?`} onClose={() => setDeleting(null)}>
          <p className="text-sm text-stone-600">Ses dépenses fixes, son solde et sa réserve seront perdus.</p>
          <div className="flex justify-end gap-2">
            <button className={btn.secondary} onClick={() => setDeleting(null)}>
              Annuler
            </button>
            <button
              className={btn.danger}
              onClick={() => {
                mutate((d) => deleteAccountPlan(d, deleting.id))
                setDeleting(null)
              }}
            >
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PlanCard({ plan, readOnly, onDelete }: { plan: AccountPlan; readOnly: boolean; onDelete: () => void }) {
  const mutate = useKubi((s) => s.mutate)
  const total = fixedTotal(plan.items)
  const transfer = toTransfer(plan)
  const patch = (change: Partial<AccountPlan>) => mutate((d) => updateAccountPlan(d, plan.id, (p) => ({ ...p, ...change })))

  return (
    <section className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <TextField
          key={plan.name}
          value={plan.name}
          disabled={readOnly}
          className="font-semibold"
          onCommit={(name) => patch({ name })}
        />
        <button className={btn.plain} disabled={readOnly} onClick={onDelete} title="Supprimer ce compte">
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-stone-600">Dépenses fixes</h3>
        {plan.items.map((item) => (
          <ItemRow key={item.id} planId={plan.id} item={item} readOnly={readOnly} />
        ))}
        <NewItem planId={plan.id} readOnly={readOnly} />
        <div className="flex justify-between text-sm border-t border-stone-200 pt-2">
          <span>Total des dépenses fixes</span>
          <span className="font-medium tabular-nums">{formatCents(total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_9rem] items-center gap-2 text-sm">
        <span>Solde actuel</span>
        <AmountField
          key={`b${plan.balanceCents}`}
          cents={plan.balanceCents}
          signed
          disabled={readOnly}
          placeholder="0,00"
          onCommit={(balanceCents) => patch({ balanceCents })}
        />
        <span>Réserve budgétaire</span>
        <AmountField
          key={`r${plan.reserveCents}`}
          cents={plan.reserveCents}
          disabled={readOnly}
          placeholder="0,00"
          onCommit={(reserveCents) => patch({ reserveCents })}
        />
      </div>

      <div
        className={`flex justify-between items-baseline rounded-lg px-3 py-2 ${transfer < 0 ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
      >
        <span className="text-sm font-medium">{transfer < 0 ? 'Manque' : 'À transférer'}</span>
        <span className="text-xl font-semibold tabular-nums">{formatCents(Math.abs(transfer))}</span>
      </div>
    </section>
  )
}

function DirectionSelect({ value, onChange, disabled }: { value: FixedItem['direction']; onChange: (v: FixedItem['direction']) => void; disabled: boolean }) {
  return (
    <select
      className="text-sm border border-stone-300 rounded-lg px-2 py-2 bg-white"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as FixedItem['direction'])}
    >
      <option value="debit">Débit</option>
      <option value="credit">Crédit</option>
    </select>
  )
}

function ItemRow({ planId, item, readOnly }: { planId: string; item: FixedItem; readOnly: boolean }) {
  const mutate = useKubi((s) => s.mutate)
  const patch = (change: Partial<Omit<FixedItem, 'id'>>) => mutate((d) => updateFixedItem(d, planId, item.id, change))
  return (
    <div className="flex items-center gap-2">
      <TextField key={item.name} value={item.name} disabled={readOnly} className="flex-1 min-w-0" onCommit={(name) => patch({ name })} />
      <AmountField
        key={item.amountCents}
        cents={item.amountCents}
        disabled={readOnly}
        className="!w-28 shrink-0"
        onCommit={(amountCents) => amountCents !== undefined && patch({ amountCents })}
      />
      <DirectionSelect value={item.direction} disabled={readOnly} onChange={(direction) => patch({ direction })} />
      <button className={btn.plain} disabled={readOnly} onClick={() => mutate((d) => deleteFixedItem(d, planId, item.id))} title="Supprimer">
        ✕
      </button>
    </div>
  )
}

function NewItem({ planId, readOnly }: { planId: string; readOnly: boolean }) {
  const mutate = useKubi((s) => s.mutate)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<FixedItem['direction']>('debit')
  const amountCents = parseEuros(amount)
  const valid = name.trim() !== '' && amountCents !== null

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        mutate((d) => addFixedItem(d, planId, { id: crypto.randomUUID(), name: name.trim(), amountCents, direction }))
        setName('')
        setAmount('')
        setDirection('debit')
      }}
    >
      <input className={`${input} flex-1 min-w-0`} placeholder="Nouvelle dépense" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
      <input
        className={`${input} !w-28 shrink-0 text-right`}
        inputMode="decimal"
        placeholder="0,00"
        value={amount}
        disabled={readOnly}
        onChange={(e) => setAmount(e.target.value)}
      />
      <DirectionSelect value={direction} disabled={readOnly} onChange={setDirection} />
      <button type="submit" className={btn.secondary} disabled={readOnly || !valid} title="Ajouter">
        +
      </button>
    </form>
  )
}
