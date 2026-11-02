import { useEffect, useMemo, useRef, useState } from 'react'
import { summarizeMonth } from '@kubi/domain/budgets'
import { assignMonths, monthLabel, monthsWithOperations } from '@kubi/domain/months'
import type { MonthKey } from '@kubi/domain/types'
import { signOut, watchUser, type AuthUser } from './auth/firebase'
import { useData, useKubi } from './state/store'
import { CategoriesView } from './components/CategoriesView'
import { InviteDialog } from './components/InviteDialog'
import { MonthReviewDialog } from './components/MonthReviewDialog'
import { OperationsView } from './components/OperationsView'
import { AccessDenied, FolderSetup, SignIn } from './components/Setup'
import { StatsView } from './components/StatsView'
import { TransfersView } from './components/TransfersView'
import { btn } from './components/format'
import { MigrationPanel } from './components/MigrationPanel'
import { BottomNav, MobileHeader, type Tab } from './components/MobileChrome'
import { useIsMobile } from './components/useIsMobile'

const REFRESH_INTERVAL_MS = 10 * 60_000
const REVIEW_SEEN_KEY = 'kubi-review-seen'

const readSeen = (): string | null => {
  try {
    return localStorage.getItem(REVIEW_SEEN_KEY)
  } catch {
    return null
  }
}
const writeSeen = (month: MonthKey) => {
  try {
    localStorage.setItem(REVIEW_SEEN_KEY, month)
  } catch {
    // Without storage the review simply shows again next time.
  }
}

export default function App() {
  /** Undefined until Firebase knows whether someone is signed in. */
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const member = useKubi((s) => s.member)
  const confirmed = useKubi((s) => s.confirmed)
  const folder = useKubi((s) => s.folder)
  const [choosingFolder, setChoosingFolder] = useState(false)

  useEffect(
    () =>
      watchUser((u) => {
        // Another account must not see the previous one's data, even for an instant.
        useKubi.getState().reset()
        setUser(u)
        if (u) void useKubi.getState().load()
      }),
    [],
  )

  if (user === undefined) return null
  if (!user) return <SignIn />
  if (member === false) return <AccessDenied email={user.email} />
  if (!confirmed) return <Loading />
  if (!folder || choosingFolder) return <FolderSetup onCancel={folder ? () => setChoosingFolder(false) : undefined} />
  return <Main onChooseFolder={() => setChoosingFolder(true)} />
}

function Loading() {
  const error = useKubi((s) => s.error)
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-sm text-stone-500">
      {error ? (
        <>
          <p className="text-red-700">Serveur inaccessible : {error}</p>
          <button className={btn.secondary} onClick={() => void useKubi.getState().load()}>
            Réessayer
          </button>
        </>
      ) : (
        'Chargement…'
      )}
    </div>
  )
}

function Main({ onChooseFolder }: { onChooseFolder: () => void }) {
  const { folder, pending, busy, error, alerts, lastImport, load, importNow, dismissAlert } = useKubi()
  const data = useData()
  const [tab, setTab] = useState<Tab>('operations')
  const [chosenMonth, setChosenMonth] = useState<MonthKey | null>(null)
  const [inviting, setInviting] = useState(false)
  const [reviewSeen, setReviewSeen] = useState(readSeen)
  const header = useRef<HTMLElement>(null)
  const mobile = useIsMobile()

  // What sticks under the header needs its height, which changes as its buttons wrap.
  useEffect(() => {
    const el = header.current
    if (!el) return
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [mobile])

  // Imports run on the server; the app only picks up what changed.
  useEffect(() => {
    const timer = setInterval(() => void useKubi.getState().load(), REFRESH_INTERVAL_MS)
    const onVisible = () => !document.hidden && void useKubi.getState().load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const months = useMemo(() => assignMonths(data?.operations ?? []), [data?.operations])
  const monthList = useMemo(() => monthsWithOperations(months), [months])
  const month = chosenMonth && monthList.includes(chosenMonth) ? chosenMonth : monthList[0]

  const latest = monthList[0]
  const previous = monthList[1]
  const review = useMemo(
    () => (data && latest && previous && reviewSeen !== latest ? summarizeMonth(previous, data.operations, months, data.categories) : null),
    [data, latest, previous, reviewSeen, months],
  )


  const readOnly = !!error
  const status =
    busy === 'loading'
      ? 'Chargement…'
      : busy === 'importing'
        ? 'Recherche d’exports…'
        : pending.length > 0
          ? 'Enregistrement…'
          : lastImport
            ? `${lastImport.added} opération(s) importée(s) à ${new Date(lastImport.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
            : null

  return (
    <div className="flex-1 flex flex-col">
      {mobile ? (
        <MobileHeader
          ref={header}
          month={month}
          monthList={monthList}
          showMonth={tab === 'operations' || tab === 'categories'}
          onMonth={setChosenMonth}
          status={status}
          syncing={!!busy}
          readOnly={readOnly}
          folderName={folder?.name}
          onSync={() => void importNow()}
          onInvite={() => setInviting(true)}
          onFolder={onChooseFolder}
          onSignOut={() => void signOut()}
        />
      ) : (
        <header ref={header} className="sticky top-0 z-40 bg-white border-b border-stone-200 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-lg font-semibold">Kubi</h1>
          <nav className="flex gap-1">
            {(
              [
                ['operations', 'Opérations'],
                ['categories', 'Catégories'],
                ['stats', 'Statistiques'],
                ['transfers', 'Répartition'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} className={tab === key ? btn.secondary : btn.plain} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>
          {month && (tab === 'operations' || tab === 'categories') && (
            <select className="text-sm border border-stone-300 rounded-lg px-2 py-1" value={month} onChange={(e) => setChosenMonth(e.target.value)}>
              {monthList.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          )}
          <div className="flex-1" />
          <span className="text-xs text-stone-500">
            {status}
          </span>
          <button
            className={`${btn.plain} !text-xl !leading-none`}
            disabled={!!busy || readOnly}
            onClick={() => void importNow()}
            title="Rechercher de nouveaux exports"
          >
            ⟳
          </button>
          <button className={btn.plain} disabled={readOnly} onClick={() => setInviting(true)}>
            Membres
          </button>
          <button className={btn.plain} onClick={onChooseFolder} title="Changer de dossier Drive">
            📁 {folder?.name}
          </button>
          <button className={btn.plain} onClick={() => void signOut()} title="Se déconnecter">
            ⎋
          </button>
        </header>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800 flex items-center gap-3">
          <span className="flex-1">Serveur inaccessible, lecture seule : {error}</span>
          <button className={btn.secondary} onClick={() => void load()}>
            Réessayer
          </button>
        </div>
      )}
      {alerts.map((a) => (
        <div key={a.id} className="bg-orange-50 border-b border-orange-200 px-4 py-2 text-sm text-orange-900 flex items-center gap-3">
          <span className="flex-1">Import : {a.message}</span>
          <button className={btn.plain} onClick={() => void dismissAlert(a.id)}>
            ✕
          </button>
        </div>
      ))}

      <main className={mobile ? 'flex-1 bg-stone-50 px-3 pt-3 pb-[calc(9rem+env(safe-area-inset-bottom))]' : 'flex-1 p-4 bg-stone-50'}>
        {!data ? (
          <p className="text-sm text-stone-500">{busy ? 'Chargement des données…' : ''}</p>
        ) : tab === 'operations' ? (
          month ? (
            <OperationsView data={data} months={months} month={month} readOnly={readOnly} />
          ) : (
            <div className="text-sm text-stone-500 flex flex-col items-start gap-2">
              <p>
                Aucune opération. Déposez un export <code>export-operations-….csv</code> dans le dossier « {folder?.name} ».
              </p>
              {data.categories.length === 0 && <MigrationPanel readOnly={readOnly} />}
            </div>
          )
        ) : tab === 'categories' ? (
          <CategoriesView data={data} month={month ?? new Date().toISOString().slice(0, 7)} readOnly={readOnly} />
        ) : tab === 'stats' ? (
          <StatsView data={data} months={months} />
        ) : (
          <TransfersView data={data} readOnly={readOnly} />
        )}
      </main>
      {mobile && <BottomNav tab={tab} onTab={setTab} />}

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {review && (
        <MonthReviewDialog
          summary={review}
          onClose={() => {
            writeSeen(latest)
            setReviewSeen(latest)
          }}
        />
      )}
    </div>
  )
}
