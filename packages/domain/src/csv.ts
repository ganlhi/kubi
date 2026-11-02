/**
 * Reading the bank's operation exports: `export-operations-DD-MM-YYYY_HH-MM-SS.csv`,
 * UTF-8 with a BOM, `;`-separated, French decimal commas in the amount.
 */

const FILE_NAME = /^export-operations-(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})\.csv$/

/** A sortable `YYYY-MM-DD HH:MM:SS` key for an export file name, or null if it is not one. */
export function exportTimestamp(fileName: string): string | null {
  const m = FILE_NAME.exec(fileName)
  if (!m) return null
  const [, dd, mm, yyyy, h, min, s] = m
  return `${yyyy}-${mm}-${dd} ${h}:${min}:${s}`
}

export const EXPECTED_HEADER = [
  'Date Opération',
  'Date Valeur',
  'Libellé',
  'Libellé Suggéré',
  'Catégorie',
  'Catégorie Parente',
  'Solde',
  'Commentaire',
  'Numéro Compte',
  'Libellé Compte',
  'Solde',
  'Pointage',
]

export interface ExportRow {
  date: string
  valueDate: string
  label: string
  amountCents: number
  accountNumber: string
}

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvFormatError'
  }
}

/** Split `;`-separated text into rows of fields, honouring double quotes. */
function splitCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ';') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

/** `-1 234,56` → -123456. */
export function parseAmountCents(raw: string): number {
  const cleaned = raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) throw new CsvFormatError(`Montant illisible : « ${raw} »`)
  return Math.round(Number(cleaned) * 100)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Rows in file order (the bank lists newest first). */
export function parseExport(text: string): ExportRow[] {
  const [header, ...rows] = splitCsv(text.replace(/^\uFEFF/, ''))
  if (!header || header.length !== EXPECTED_HEADER.length || header.some((h, i) => h.trim() !== EXPECTED_HEADER[i])) {
    throw new CsvFormatError('En-tête inattendu : ce fichier ne ressemble pas à un export d’opérations.')
  }
  return rows.map((r, i) => {
    if (r.length !== EXPECTED_HEADER.length) throw new CsvFormatError(`Ligne ${i + 2} : ${r.length} colonnes au lieu de ${EXPECTED_HEADER.length}.`)
    const [date, valueDate, label, , , , amount, , accountNumber] = r
    if (!ISO_DATE.test(date) || !ISO_DATE.test(valueDate)) throw new CsvFormatError(`Ligne ${i + 2} : date illisible.`)
    return { date, valueDate, label, amountCents: parseAmountCents(amount), accountNumber }
  })
}
