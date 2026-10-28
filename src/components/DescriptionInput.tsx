import { useMemo, useRef, useState } from 'react'
import { suggest } from '../domain/suggest'
import { input } from './format'

/**
 * A text field suggesting earlier descriptions, but only once something is
 * typed: the full list would be unusable once there are many of them.
 */
export function DescriptionInput({ value, options, disabled, onCommit }: {
  value: string
  options: string[]
  disabled: boolean
  onCommit: (value: string) => void
}) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Enter commits then blurs; the blur must not commit again with the text as it was typed.
  const committedByKey = useRef(false)
  const suggestions = useMemo(() => (open ? suggest(options, text) : []), [open, options, text])

  const commit = (next: string) => {
    setText(next)
    setOpen(false)
    if (next.trim() !== value) onCommit(next)
  }

  return (
    <div className="relative sm:w-72">
      <input
        className={`${input} !py-1`}
        placeholder="Description"
        value={text}
        disabled={disabled}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-autocomplete="list"
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onBlur={() => {
          if (committedByKey.current) committedByKey.current = false
          else commit(text)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && suggestions.length > 0) {
            e.preventDefault()
            setActive((i) => (i + 1) % suggestions.length)
          } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
            e.preventDefault()
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            commit(suggestions[active] ?? text)
            committedByKey.current = true
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-20 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg py-1 text-sm">
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              className={`px-3 py-1 cursor-pointer ${i === active ? 'bg-emerald-50' : ''}`}
              // Before the input's blur, which would otherwise commit the half-typed text first.
              onMouseDown={(e) => {
                e.preventDefault()
                commit(s)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
