import { describe, expect, it } from 'vitest'
import { applyCommand, isCommand, type Command } from './commands'
import { emptyDataFile, type DataFile } from './types'

const base = (): DataFile => ({
  ...emptyDataFile(),
  categories: [{ id: 'c1', name: 'Livres', color: '#aa0000', kind: 'expense', budgets: [] }],
  operations: [
    { id: 'o1', date: '2026-10-01', valueDate: '2026-10-01', label: 'LIVRE', amountCents: -1200, seq: 0, categoryId: 'c1', description: 'Roman' },
    { id: 'o2', date: '2026-10-02', valueDate: '2026-10-02', label: 'LIVRE 2', amountCents: -800, seq: 1 },
  ],
  nextSeq: 2,
  accountPlans: [{ id: 'p', name: 'Courant', items: [{ id: 'i', name: 'Loyer', amountCents: 80000, direction: 'debit' }], balanceCents: 1000 }],
})

/** Through JSON, as a command travels to the server. */
const roundTrip = (cmd: Command): Command => JSON.parse(JSON.stringify(cmd)) as Command

describe('commands', () => {
  it('applies the domain rules', () => {
    const data = applyCommand(base(), { type: 'setDescription', id: 'o2', description: 'Roman' })
    expect(data.operations[1]).toMatchObject({ description: 'Roman', categoryId: 'c1' })
  })

  it('unsets with null or a missing field', () => {
    expect(applyCommand(base(), roundTrip({ type: 'setCategory', id: 'o1' })).operations[0].categoryId).toBeUndefined()
    expect(applyCommand(base(), { type: 'setCategory', id: 'o1', categoryId: null }).operations[0].categoryId).toBeUndefined()
  })

  it('clears a plan field sent as null', () => {
    const data = applyCommand(base(), roundTrip({ type: 'updateAccountPlan', id: 'p', patch: { balanceCents: null, name: 'Joint' } }))
    expect(data.accountPlans![0]).toMatchObject({ name: 'Joint', balanceCents: undefined })
    expect(data.accountPlans![0].items).toHaveLength(1)
  })

  it('adds a temporary operation at the next seq', () => {
    const data = applyCommand(base(), { type: 'addTemporary', id: 'temp:1', date: '2026-10-03', label: 'Courses', amountCents: -5000 })
    expect(data.operations[2]).toMatchObject({ id: 'temp:1', seq: 2, temporary: true })
    expect(data.nextSeq).toBe(3)
  })

  it('recognises commands', () => {
    expect(isCommand({ type: 'deleteTemporary', id: 'x' })).toBe(true)
    expect(isCommand({ type: 'dropTables' })).toBe(false)
    expect(isCommand(null)).toBe(false)
  })
})
