import { describe, expect, it } from 'vitest'
import { CsvFormatError, exportTimestamp, parseAmountCents, parseExport } from './csv'
import { importRows, operationIds } from './importOps'
import { addMonths, assignMonths, defaultFlagMonth } from './months'
import { budgetFor, summarizeMonth, withBudgetFrom } from './budgets'
import { addTemporary, deleteCategory, deleteTemporary, duplicateCandidates, mergeDuplicates, setDescription } from './edits'
import { suggestColor } from './colors'
import { decodeInvite, encodeInvite } from './invite'
import { rankDescriptions, suggest } from './suggest'
import { addAccountPlan, addFixedItem, deleteAccountPlan, deleteFixedItem, fixedTotal, toTransfer, updateFixedItem } from './transfers'
import { emptyDataFile, type AccountPlan, type Category, type DataFile, type Operation } from './types'

const HEADER =
  '﻿"Date Opération";"Date Valeur";Libellé;"Libellé Suggéré";Catégorie;"Catégorie Parente";Solde;Commentaire;"Numéro Compte";"Libellé Compte";Solde;Pointage'
const line = (date: string, label: string, amount: string, account = '0001') =>
  `${date};${date};"${label}";x;"a; b";y;${amount};;${account};"Compte";1761.19;Non`
const csv = (...lines: string[]) => [HEADER, ...lines].join('\r\n') + '\r\n'

const op = (id: string, date: string, amountCents: number, extra: Partial<Operation> = {}): Operation => ({
  id,
  date,
  valueDate: date,
  label: id,
  amountCents,
  seq: 0,
  ...extra,
})

describe('csv', () => {
  it('recognises export file names', () => {
    expect(exportTimestamp('export-operations-28-10-2026_13-31-55.csv')).toBe('2026-10-28 13:31:55')
    expect(exportTimestamp('autre.csv')).toBeNull()
  })

  it('parses amounts with decimal commas', () => {
    expect(parseAmountCents('-10,90')).toBe(-1090)
    expect(parseAmountCents('1 234,5')).toBe(123450)
    expect(() => parseAmountCents('abc')).toThrow(CsvFormatError)
  })

  it('parses rows, quoted separators included', () => {
    const rows = parseExport(csv(line('2026-09-30', 'CARTE "X"; Y', '-10,90')))
    expect(rows).toEqual([{ date: '2026-09-30', valueDate: '2026-09-30', label: 'CARTE X; Y', amountCents: -1090, accountNumber: '0001' }])
  })

  it('rejects an unexpected header', () => {
    expect(() => parseExport('a;b\n1;2\n')).toThrow(CsvFormatError)
  })
})

describe('import', () => {
  const rows = parseExport(
    csv(line('2026-09-30', 'CAFE', '-2,50'), line('2026-09-30', 'CAFE', '-2,50'), line('2026-09-29', 'LIVRE', '-12,00')),
  )

  it('ranks identical rows of one file', () => {
    expect(operationIds(rows).map((id) => id.split('|').pop())).toEqual(['0', '1', '0'])
  })

  it('gives a lone operation the same ID in any file', () => {
    expect(operationIds([rows[2]])).toEqual([operationIds(rows)[2]])
  })

  it('adds new operations oldest first and skips known ones', () => {
    const first = importRows(emptyDataFile('a@x'), rows)
    if (!first.ok) throw new Error(first.error)
    expect(first.added).toBe(3)
    expect(first.data.operations.map((o) => o.label)).toEqual(['LIVRE', 'CAFE', 'CAFE'])
    expect(first.data.accountNumber).toBe('0001')

    const again = importRows(first.data, rows.slice(1))
    if (!again.ok) throw new Error(again.error)
    expect(again.added).toBe(0)
  })

  it('never re-imports an ignored ID', () => {
    const data = { ...emptyDataFile('a@x'), ignoredIds: [operationIds(rows)[2]] }
    const result = importRows(data, rows)
    expect(result.ok && result.added).toBe(2)
  })

  it('refuses another account', () => {
    const data = { ...emptyDataFile('a@x'), accountNumber: '0001' }
    const result = importRows(data, parseExport(csv(line('2026-09-30', 'X', '1,00', '9999'))))
    expect(result.ok).toBe(false)
  })
})

describe('months', () => {
  it('adds months across years', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('defaults the flag month on the day of month', () => {
    expect(defaultFlagMonth('2026-10-28')).toBe('2026-11')
    expect(defaultFlagMonth('2026-11-02')).toBe('2026-11')
  })

  it('moves later operations into the flagged month unless dated after it', () => {
    const months = assignMonths([
      op('before', '2026-10-27', -100, { seq: 0 }),
      op('salary', '2026-10-28', 200000, { seq: 1, monthStart: '2026-11' }),
      op('sameDayAfter', '2026-10-28', -100, { seq: 2 }),
      op('lateImport', '2026-10-29', -100, { seq: 9 }),
      op('december', '2026-12-01', -100, { seq: 3 }),
      op('manual', '2026-10-30', -100, { seq: 4, monthOverride: '2026-10' }),
    ])
    expect(Object.fromEntries(months)).toEqual({
      before: '2026-10',
      salary: '2026-11',
      sameDayAfter: '2026-11',
      lateImport: '2026-11',
      december: '2026-12',
      manual: '2026-10',
    })
  })

  it('orders same-day operations by import order', () => {
    const months = assignMonths([
      op('flag', '2026-10-28', 1, { seq: 5, monthStart: '2026-11' }),
      op('earlier', '2026-10-28', -1, { seq: 4 }),
    ])
    expect(months.get('earlier')).toBe('2026-10')
  })
})

describe('budgets', () => {
  const books: Category = { id: 'books', name: 'Livres', color: '#000000', kind: 'expense', budgets: [] }
  const salary: Category = { id: 'salary', name: 'Salaire', color: '#000000', kind: 'income', budgets: [] }
  const refloat: Category = { id: 'refloat', name: 'Renflouage', color: '#000000', kind: 'refloat', budgets: [] }

  it('keeps past caps when a cap changes', () => {
    const c = withBudgetFrom(withBudgetFrom(books, '2026-01', 12000), '2026-03', 15000)
    expect(budgetFor(c, '2025-12')).toBeNull()
    expect(budgetFor(c, '2026-02')).toBe(12000)
    expect(budgetFor(c, '2026-04')).toBe(15000)
    expect(budgetFor(withBudgetFrom(c, '2026-05', null), '2026-06')).toBeNull()
  })

  it('summarises a month', () => {
    const capped = withBudgetFrom(books, '2026-01', 10000)
    const ops = [
      op('s1', '2026-10-01', 200000, { categoryId: 'salary' }),
      op('s2', '2026-10-02', 80000, { categoryId: 'salary' }),
      op('b1', '2026-10-03', -9500, { categoryId: 'books' }),
      op('b2', '2026-10-04', 500, { categoryId: 'books' }),
      op('r', '2026-10-05', 30000, { categoryId: 'refloat' }),
      op('u', '2026-10-06', -131000),
      op('other', '2026-09-30', -99999, { categoryId: 'books' }),
    ]
    const months = assignMonths(ops)
    const s = summarizeMonth('2026-10', ops, months, [capped, salary, refloat])
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0]).toMatchObject({ spentCents: 9000, budgetCents: 10000, status: 'alert' })
    expect(s.totalBudgetCents).toBe(280000)
    expect(s.totalSpentCents).toBe(140000)
    expect(s.totalRatio).toBe(0.5)
    expect(s.refloatCents).toBe(30000)
    expect(s.uncategorizedCount).toBe(1)
  })
})

describe('edits', () => {
  const base: DataFile = {
    ...emptyDataFile('a@x'),
    operations: [
      op('old', '2026-09-01', -1, { seq: 0, description: 'Courses', categoryId: 'food' }),
      op('newer', '2026-09-15', -1, { seq: 1, description: 'Courses', categoryId: 'home' }),
      op('blank', '2026-10-01', -1, { seq: 2 }),
      op('set', '2026-10-02', -1, { seq: 3, categoryId: 'mine' }),
    ],
  }

  it('takes the category of the latest operation with the same description', () => {
    expect(setDescription(base, 'blank', 'Courses').operations[2]).toMatchObject({ description: 'Courses', categoryId: 'home' })
    expect(setDescription(base, 'set', 'Courses').operations[3].categoryId).toBe('mine')
  })

  it('merges duplicates and remembers the dropped ID', () => {
    const merged = mergeDuplicates(base, 'blank', 'old')
    expect(merged.operations.map((o) => o.id)).toEqual(['newer', 'blank', 'set'])
    expect(merged.operations[1]).toMatchObject({ description: 'Courses', categoryId: 'food' })
    expect(merged.ignoredIds).toEqual(['old'])
  })

  it('adds a temporary operation, merges it into the real one, and forgets it', () => {
    const withTemp = addTemporary(base, 'temp', { date: '2026-10-03', label: 'Dentiste', amountCents: -5000 })
    expect(withTemp.operations.at(-1)).toMatchObject({ id: 'temp', valueDate: '2026-10-03', seq: 0, temporary: true })
    expect(withTemp.nextSeq).toBe(1)
    const described = setDescription(withTemp, 'temp', 'Santé')
    const merged = mergeDuplicates(described, 'blank', 'temp')
    expect(merged.operations.find((o) => o.id === 'blank')?.description).toBe('Santé')
    expect(merged.operations.some((o) => o.id === 'temp')).toBe(false)
    expect(merged.ignoredIds).toEqual([])
  })

  it('describes the real operation with the temporary label when nothing else describes it', () => {
    const withTemp = addTemporary(base, 'temp', { date: '2026-10-03', label: 'Dentiste', amountCents: -1 })
    expect(mergeDuplicates(withTemp, 'blank', 'temp').operations.find((o) => o.id === 'blank')?.description).toBe('Dentiste')
    // An imported duplicate's bank label is no description.
    expect(mergeDuplicates(base, 'old', 'blank').operations.find((o) => o.id === 'old')?.description).toBe('Courses')
    expect(mergeDuplicates(base, 'blank', 'set').operations.find((o) => o.id === 'blank')?.description).toBeUndefined()
  })

  it('pairs temporary operations with uncategorised real ones of the same amount, closest first', () => {
    const ops = [
      op('far', '2026-09-01', -5000),
      op('near', '2026-10-05', -5000),
      op('categorised', '2026-10-03', -5000, { categoryId: 'food' }),
      op('other', '2026-10-03', -4999),
      op('t2', '2026-10-10', -4999, { temporary: true }),
      op('t1', '2026-10-03', -5000, { temporary: true }),
      op('t3', '2026-10-03', -5000, { temporary: true, seq: 1 }),
    ]
    expect(duplicateCandidates(ops).map((p) => `${p.temporary.id}:${p.real.id}`)).toEqual([
      't1:near',
      't1:far',
      't3:near',
      't3:far',
      't2:other',
    ])
  })

  it('deletes only temporary operations', () => {
    const withTemp = addTemporary(base, 'temp', { date: '2026-10-03', label: 'X', amountCents: -1 })
    expect(deleteTemporary(withTemp, 'temp').operations).toHaveLength(4)
    expect(deleteTemporary(withTemp, 'old').operations).toHaveLength(5)
  })

  it('reassigns operations of a deleted category', () => {
    const next = deleteCategory(base, 'home', 'food')
    expect(next.operations[1].categoryId).toBe('food')
  })
})

describe('misc', () => {
  it('suggests a colour far from existing ones', () => {
    expect(suggestColor([])).toMatch(/^#[0-9a-f]{6}$/)
    expect(suggestColor(['#ff0000'])).not.toBe('#ff0000')
  })

  it('ranks descriptions by use, then alphabetically', () => {
    const ops = ['Secours', 'Cours', 'Courses', 'Cours', 'Écran', 'Secours', 'Cours'].map((d, i) =>
      op(String(i), '2026-10-01', -1, { description: d }),
    )
    expect(rankDescriptions(ops)).toEqual(['Cours', 'Secours', 'Courses', 'Écran'])
  })

  it('suggests matching descriptions once something is typed, keeping their order', () => {
    const options = ['Secours', 'Courses', 'Écran', 'Cours']
    expect(suggest(options, '')).toEqual([])
    expect(suggest(options, 'cour')).toEqual(['Secours', 'Courses', 'Cours'])
    expect(suggest(options, 'ecr')).toEqual(['Écran'])
    expect(suggest(options, 'Cours')).toEqual(['Secours', 'Courses'])
  })

  it('round-trips an invitation', () => {
    const invite = { clientId: 'abc.apps.googleusercontent.com', folderId: 'f1', email: 'éa@x.fr' }
    expect(decodeInvite(encodeInvite(invite))).toEqual(invite)
    expect(decodeInvite('garbage')).toBeNull()
  })
})

describe('transfers', () => {
  const plan: AccountPlan = {
    id: 'p',
    name: 'Courant',
    balanceCents: 250000,
    reserveCents: 30000,
    items: [
      { id: 'a', name: 'Loyer', amountCents: 90000, direction: 'debit' },
      { id: 'b', name: 'APL', amountCents: 20000, direction: 'credit' },
    ],
  }

  it('nets debits against credits', () => {
    expect(fixedTotal(plan.items)).toBe(70000)
  })

  it('computes what is left to transfer', () => {
    expect(toTransfer(plan)).toBe(150000)
    expect(toTransfer({ ...plan, balanceCents: 50000 })).toBe(-50000)
    expect(toTransfer({ id: 'q', name: 'Vide', items: [] })).toBe(0)
  })

  it('edits plans without touching operations', () => {
    let data = addAccountPlan(emptyDataFile('a@b.c'), 'p', 'Courant')
    data = addFixedItem(data, 'p', { id: 'x', name: 'Loyer', amountCents: 100, direction: 'debit' })
    data = updateFixedItem(data, 'p', 'x', { direction: 'credit' })
    expect(data.accountPlans?.[0].items[0].direction).toBe('credit')
    data = deleteFixedItem(data, 'p', 'x')
    expect(data.accountPlans?.[0].items).toEqual([])
    expect(deleteAccountPlan(data, 'p').accountPlans).toEqual([])
  })
})
