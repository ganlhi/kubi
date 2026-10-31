import { useState, type ReactNode, type Ref } from 'react'
import { monthLabel } from '../domain/months'
import type { MonthKey } from '../domain/types'

export type Tab = 'operations' | 'categories' | 'stats' | 'transfers'

const svg = (path: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)

const TABS: [Tab, string, ReactNode][] = [
  ['operations', 'Opérations', svg(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />)],
  [
    'categories',
    'Catégories',
    svg(
      <>
        <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </>,
    ),
  ],
  ['stats', 'Statistiques', svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />)],
  ['transfers', 'Répartition', svg(<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />)],
]

const iconButton =
  'size-11 flex items-center justify-center rounded-lg text-stone-600 active:bg-stone-100 disabled:opacity-50 cursor-pointer'
const menuItem = 'w-full text-left px-4 py-3 text-sm active:bg-stone-100 disabled:opacity-50 cursor-pointer'

/** The phone header: title, month and sync stay one tap away; the rarer actions go into a menu. */
export function MobileHeader({ ref, month, monthList, showMonth, onMonth, status, syncing, readOnly, folderName, onSync, onInvite, onFolder }: {
  ref: Ref<HTMLElement>
  month: MonthKey | undefined
  monthList: MonthKey[]
  showMonth: boolean
  onMonth: (month: MonthKey) => void
  status: string | null
  syncing: boolean
  readOnly: boolean
  folderName: string | undefined
  onSync: () => void
  onInvite: () => void
  onFolder: () => void
}) {
  const [menu, setMenu] = useState(false)
  const close = (action: () => void) => () => {
    setMenu(false)
    action()
  }

  return (
    <header ref={ref} className="sticky top-0 z-40 bg-white border-b border-stone-200 h-14 pl-4 pr-1 flex items-center gap-1">
      <h1 className="text-lg font-bold">Kubi</h1>
      {month && showMonth && (
        <select
          className="ml-2 h-9 min-w-0 rounded-full border border-stone-300 bg-white px-3 font-semibold capitalize"
          value={month}
          onChange={(e) => onMonth(e.target.value)}
          aria-label="Mois"
        >
          {monthList.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      )}
      <div className="flex-1" />
      <button className={iconButton} disabled={syncing || readOnly} onClick={onSync} aria-label="Rechercher de nouveaux exports">
        <span className={syncing ? 'animate-spin' : ''}>
          {svg(
            <>
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 4v5h-5" />
            </>,
          )}
        </span>
      </button>
      <div className="relative">
        <button className={iconButton} onClick={() => setMenu((m) => !m)} aria-label="Plus d’options" aria-expanded={menu}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
        {menu && (
          <>
            <div className="fixed inset-0" onClick={() => setMenu(false)} />
            <div className="absolute right-1 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-stone-200 py-1 flex flex-col">
              {status && <p className="px-4 py-2 text-xs text-stone-500 border-b border-stone-100">{status}</p>}
              <button className={menuItem} disabled={readOnly} onClick={close(onInvite)}>
                Inviter quelqu’un
              </button>
              <button className={menuItem} onClick={close(onFolder)}>
                Changer de dossier Drive
                <span className="block text-xs text-stone-500 truncate">Actuel : {folderName}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-stone-200 flex pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(([key, label, icon]) => (
        <button
          key={key}
          className={`flex-1 h-16 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${tab === key ? 'text-emerald-700' : 'text-stone-500'}`}
          aria-current={tab === key ? 'page' : undefined}
          onClick={() => onTab(key)}
        >
          {icon}
          {label}
        </button>
      ))}
    </nav>
  )
}
