import type { ReactNode } from 'react'

/** The drop-down under a combobox field; shared so every picker looks the same. */
export function OptionList<T>({ items, active, keyOf, render, onPick, onHover }: {
  items: T[]
  active: number
  keyOf: (item: T) => string
  render: (item: T) => ReactNode
  onPick: (item: T) => void
  onHover: (index: number) => void
}) {
  return (
    <ul role="listbox" className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-stone-200 rounded-lg shadow-lg py-1 text-sm">
      {items.map((item, i) => (
        <li
          key={keyOf(item)}
          role="option"
          aria-selected={i === active}
          className={`px-3 py-1 cursor-pointer ${i === active ? 'bg-emerald-50' : ''}`}
          // Before the field's blur, which would otherwise act on the half-typed text first.
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(item)
          }}
          onMouseEnter={() => onHover(i)}
        >
          {render(item)}
        </li>
      ))}
    </ul>
  )
}
