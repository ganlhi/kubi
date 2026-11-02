import type { Operation } from './types'

const MAX_SUGGESTIONS = 8

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Whether `text` contains `query`, ignoring case and accents. */
export const matches = (text: string, query: string): boolean => normalize(text).includes(normalize(query.trim()))

/** Whether the letters of `term` appear in `word` in order, gaps allowed. */
const isSubsequence = (term: string, word: string): boolean => {
  let i = 0
  for (const c of word) if (c === term[i]) i++
  return i === term.length
}

/**
 * Loose search, ignoring case and accents: every word of `query` must be found
 * in one of `texts`, as is or with letters left out (« crfour » finds
 * « Carrefour »). Left-out letters only within a single word, so short terms
 * do not match everything.
 */
export function fuzzyMatches(texts: (string | undefined)[], query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  const haystacks = texts.filter((t): t is string => !!t).map(normalize)
  const words = haystacks.flatMap((h) => h.split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  return terms.every((term) => haystacks.some((h) => h.includes(term)) || words.some((w) => w[0] === term[0] && isSubsequence(term, w)))
}

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
