import { MONTH_NAMES } from '../domain/months'
import type { MonthKey } from '../domain/types'
import { input } from './format'

/** Month and year pickers in French: the native month field follows the browser's language instead. */
export function MonthInput({ value, onChange }: { value: MonthKey; onChange: (month: MonthKey) => void }) {
  const [year, month] = value.split('-').map(Number)
  const years = [-2, -1, 0, 1, 2].map((n) => year + n)
  const set = (y: number, m: number) => onChange(`${y}-${String(m).padStart(2, '0')}`)
  return (
    <div className="flex gap-2 mt-1">
      <select className={input} value={month} onChange={(e) => set(year, Number(e.target.value))} aria-label="Mois">
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select className={`${input} !w-28`} value={year} onChange={(e) => set(Number(e.target.value), month)} aria-label="Année">
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  )
}
