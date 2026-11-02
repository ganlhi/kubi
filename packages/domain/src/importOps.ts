import type { ExportRow } from './csv'
import type { DataFile, Operation } from './types'

/**
 * The 4 identifying fields, plus the rank among identical rows of the same
 * file: a lone operation always gets 0, so it keeps its ID from one export to
 * the next, while two identical coffees on the same day both survive.
 */
export function operationIds(rows: ExportRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const key = `${r.date}|${r.valueDate}|${r.label}|${r.amountCents}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return `${key}|${n}`
  })
}

export type ImportResult =
  | { ok: true; data: DataFile; added: number }
  | { ok: false; error: string }

/** Merge one export into the data file. IDs already known or ignored are skipped. */
export function importRows(data: DataFile, rows: ExportRow[]): ImportResult {
  const accounts = new Set(rows.map((r) => r.accountNumber))
  const expected = data.accountNumber ?? rows[0]?.accountNumber
  const foreign = [...accounts].filter((a) => a !== expected)
  if (foreign.length > 0) {
    return { ok: false, error: `Compte inattendu (${foreign.join(', ')}) : seul le compte ${expected} est suivi.` }
  }

  const known = new Set([...data.operations.map((o) => o.id), ...data.ignoredIds])
  const ids = operationIds(rows)
  let seq = data.nextSeq
  const added: Operation[] = []
  // The bank lists newest first; walk oldest first so `seq` runs with time.
  for (let i = rows.length - 1; i >= 0; i--) {
    if (known.has(ids[i])) continue
    const { date, valueDate, label, amountCents } = rows[i]
    added.push({ id: ids[i], date, valueDate, label, amountCents, seq: seq++ })
  }
  return {
    ok: true,
    added: added.length,
    data: {
      ...data,
      accountNumber: expected,
      operations: [...data.operations, ...added],
      nextSeq: seq,
    },
  }
}
