import { useMemo, useState } from 'react'
import { matches } from '../domain/suggest'
import type { Category } from '../domain/types'
import { input } from './format'
import { OptionList } from './OptionList'

const NONE = { id: '', name: 'Aucune catégorie', color: '' }
type Option = Pick<Category, 'id' | 'name' | 'color'>

function Dot({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color || '#d6d3d1' }} />
}

/** A select that looks like the description field: the whole list on opening, filtered as one types. */
export function CategorySelect({ categories, value, disabled, onChange }: {
  categories: Category[]
  value: string | undefined
  disabled: boolean
  onChange: (categoryId: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const current = categories.find((c) => c.id === value)

  const sorted = useMemo(() => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [categories])
  const options: Option[] = useMemo(
    () => (query.trim() ? sorted.filter((c) => matches(c.name, query)) : [NONE, ...sorted]),
    [sorted, query],
  )

  const openList = () => {
    if (open) return
    setOpen(true)
    setQuery('')
    setActive(Math.max(0, sorted.findIndex((c) => c.id === value) + 1))
  }
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const pick = (option: Option) => {
    if ((option.id || undefined) !== value) onChange(option.id || undefined)
    close()
  }

  return (
    <div className="relative sm:w-44">
      {current && !query && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 flex pointer-events-none">
          <Dot color={current.color} />
        </span>
      )}
      <input
        className={`${input} !py-1 ${current && !query ? 'pl-7' : ''} placeholder:italic placeholder:text-stone-400 cursor-pointer`}
        placeholder={open && current ? current.name : '— Catégorie —'}
        value={open ? query : (current?.name ?? '')}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={openList}
        onClick={openList}
        onBlur={close}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) return openList()
            const step = e.key === 'ArrowDown' ? 1 : -1
            setActive((i) => (i + step + options.length) % Math.max(1, options.length))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (open && options[active]) pick(options[active])
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            close()
            e.currentTarget.blur()
          }
        }}
      />
      {open && options.length > 0 && (
        <OptionList
          items={options}
          active={active}
          keyOf={(o) => o.id || 'none'}
          render={(o) =>
            o.id ? (
              <span className="flex items-center gap-2">
                <Dot color={o.color} />
                {o.name}
              </span>
            ) : (
              <span className="italic text-stone-400">{o.name}</span>
            )
          }
          onPick={pick}
          onHover={setActive}
        />
      )}
    </div>
  )
}
