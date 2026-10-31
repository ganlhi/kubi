import { useEffect, useMemo, useRef, useState } from 'react'
import { summarizeMonth } from './domain/budgets'
import { assignMonths, monthLabel, monthsWithOperations } from './domain/months'
import type { MonthKey } from './domain/types'
import { hasValidToken, preloadGoogleIdentity, renewAccessTokenSilently, startTokenRenewal } from './drive/googleAuth'
import { useData, useKubi } from './state/store'
import { CategoriesView } from './components/CategoriesView'
import { InviteDialog } from './components/InviteDialog'
import { MonthReviewDialog } from './components/MonthReviewDialog'
import { OperationsView } from './components/OperationsView'
import { Setup } from './components/Setup'
import { StatsView } from './components/StatsView'
import { TransfersView } from './components/TransfersView'
import { btn } from './components/format'
import { BottomNav, MobileHeader, type Tab } from './components/MobileChrome'
import { useIsMobile } from './components/useIsMobile'

const SCAN_INTERVAL_MS = 10 * 60_000
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
  const clientId = useKubi((s) => s.clientId)
  const folder = useKubi((s) => s.folder)
  const [signedIn, setSignedIn] = useState(() => !!clientId && hasValidToken(clientId))

  useEffect(() => {
    if (!clientId || signedIn) return
    let cancelled = false
    void preloadGoogleIdentity()
      .then(() => renewAccessTokenSilently(clientId))
      .then((token) => token && !cancelled && setSignedIn(true))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId, signedIn])

  if (!clientId || !signedIn || !folder) return <Setup signedIn={!!clientId && signedIn} onSignedIn={() => setSignedIn(true)} />
  return <Main />
}

function Main() {
  const { clientId, folder, confirmed, pending, busy, error, alerts, lastImport, connect, sync, signIn, setFolder, dismissAlert } =
    useKubi()
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

  useEffect(() => {
    void connect()
    const stopRenewal = startTokenRenewal(clientId)
    const timer = setInterval(() => void useKubi.getState().sync(), SCAN_INTERVAL_MS)
    const onVisible = () => !document.hidden && void useKubi.getState().sync()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopRenewal()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [clientId, connect])

  const months = useMemo(() => assignMonths(data?.operations ?? []), [data?.operations])
  const monthList = useMemo(() => monthsWithOperations(months), [months])
  const month = chosenMonth && monthList.includes(chosenMonth) ? chosenMonth : monthList[0]

  const latest = monthList[0]
  const previous = monthList[1]
  const review = useMemo(
    () => (data && latest && previous && reviewSeen !== latest ? summarizeMonth(previous, data.operations, months, data.categories) : null),
    [data, latest, previous, reviewSeen, months],
  )

  const reconnect = async () => {
    try {
      await signIn()
      await (confirmed ? sync() : connect())
    } catch {
      // The error banner stays up; the user can try again.
    }
  }

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
          onSync={() => void sync()}
          onInvite={() => setInviting(true)}
          onFolder={() => setFolder(null)}
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
            onClick={() => void sync()}
            title="Rechercher de nouveaux exports"
          >
            ⟳
          </button>
          <button className={btn.plain} disabled={readOnly} onClick={() => setInviting(true)}>
            Inviter
          </button>
          <button className={btn.plain} onClick={() => setFolder(null)} title="Changer de dossier Drive">
            📁 {folder?.name}
          </button>
        </header>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800 flex items-center gap-3">
          <span className="flex-1">Drive inaccessible, lecture seule : {error}</span>
          <button className={btn.secondary} onClick={() => void reconnect()}>
            Se reconnecter
          </button>
        </div>
      )}
      {alerts.map((a, i) => (
        <div key={a} className="bg-orange-50 border-b border-orange-200 px-4 py-2 text-sm text-orange-900 flex items-center gap-3">
          <span className="flex-1">Import : {a}</span>
          <button className={btn.plain} onClick={() => dismissAlert(i)}>
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
            <p className="text-sm text-stone-500">
              Aucune opération. Déposez un export <code>export-operations-….csv</code> dans le dossier « {folder?.name} ».
            </p>
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
