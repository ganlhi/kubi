import type { Operation } from './types'

const MAX_SUGGESTIONS = 8

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Every description in use, most frequent first, then alphabetically. */
export function rankDescriptions(operations: Operation[]): string[] {
  const counts = new Map<string, number>()
  for (const op of operations) if (op.description) counts.set(op.description, (counts.get(op.description) ?? 0) + 1)
  return [...counts].sort(([a, m], [b, n]) => n - m || a.localeCompare(b, 'fr')).map(([d]) => d)
}

/** The options containing `query`, in their given order; none until something is typed. */
export function suggest(options: string[], query: string): string[] {
  const q = normalize(query.trim())
  if (!q) return []
  return options
    .filter((option) => {
      const n = normalize(option)
      return n !== q && n.includes(q)
    })
    .slice(0, MAX_SUGGESTIONS)
}
