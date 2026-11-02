import { describe, expect, it } from 'vitest'
import { applyCommand } from '@kubi/domain/commands'
import { emptyDataFile, type DataFile } from '@kubi/domain/types'
import { createMemoryStore } from './memoryStore'
import { createRepo } from './repo'
import { diffData, docId, isEmptyDiff } from './store'

const data = (): DataFile => ({
  ...emptyDataFile(),
  categories: [
    { id: 'a', name: 'A', color: '#000000', kind: 'expense', budgets: [] },
    { id: 'b', name: 'B', color: '#ffffff', kind: 'income', budgets: [] },
  ],
  operations: [
    { id: '2026-10-01|2026-10-01|PRLV A/B|-100|0', date: '2026-10-01', valueDate: '2026-10-01', label: 'PRLV A/B', amountCents: -100, seq: 0 },
    { id: 'x', date: '2026-10-02', valueDate: '2026-10-02', label: 'X', amountCents: -200, seq: 1 },
  ],
  nextSeq: 2,
  accountPlans: [],
})

describe('diff', () => {
  it('writes only what changed', () => {
    const before = data()
    const after = applyCommand(before, { type: 'setCategory', id: 'x', categoryId: 'a' })
    const diff = diffData(before, after)
    expect([...diff.operations.keys()]).toEqual([docId('x')])
    expect(diff.categories.size + diff.ignoredIds.size).toBe(0)
    expect(isEmptyDiff(diffData(before, structuredClone(before)))).toBe(true)
  })

  it('keeps operation IDs with a slash out of document IDs', () => {
    expect(docId(data().operations[0].id)).toMatch(/^[0-9a-f]{40}$/)
  })

  it('rewrites the categories that move', () => {
    const before = data()
    const after = applyCommand(before, { type: 'deleteCategory', id: 'a' })
    const diff = diffData(before, after)
    expect(diff.categories.get('a')).toBeNull()
    expect(diff.categories.get('b')).toMatchObject({ pos: 0 })
  })

  it('records merged duplicates and the counters', () => {
    const before = data()
    const after = applyCommand(before, { type: 'mergeDuplicates', keepId: 'x', dropId: before.operations[0].id })
    const diff = diffData(before, after)
    expect(diff.operations.get(docId(before.operations[0].id))).toBeNull()
    expect([...diff.ignoredIds.values()]).toEqual([{ id: before.operations[0].id }])
  })
})

describe('repo', () => {
  it('round-trips the data through the store', async () => {
    const store = createMemoryStore()
    const repo = createRepo(store)
    await repo.update(() => ({ after: data() }))
    expect((await createRepo(store).current()).data).toEqual(data())
  })

  it('replays a change on top of someone else’s write', async () => {
    const store = createMemoryStore()
    const mine = createRepo(store)
    const theirs = createRepo(store)
    await mine.update(() => ({ after: data() }))
    await mine.current()
    await theirs.update((s) => ({ after: applyCommand(s.data, { type: 'setDescription', id: 'x', description: 'eux' }) }))
    // `mine` caches the version before their write: it must apply its change on theirs.
    const after = await mine.update((s) => ({ after: applyCommand(s.data, { type: 'setCategory', id: 'x', categoryId: 'a' }) }))
    expect(after.data.operations[1]).toMatchObject({ description: 'eux', categoryId: 'a' })
    expect((await createRepo(store).current()).data.operations[1]).toMatchObject({ description: 'eux', categoryId: 'a' })
  })
})
