import { useState } from 'react'
import type { MigrationPreview, MigrationReport, MigrationRequest } from '@kubi/domain/api'
import { api } from '../api/client'
import { useKubi } from '../state/store'
import { btn, messageOf } from './format'

/**
 * Bringing over the data file of the Drive-only app, in two steps: look at
 * what it holds, then choose who keeps access. The file's list of accounts is
 * not to be trusted as is: the old app added anyone who opened it.
 */
export function MigrationPanel({ readOnly }: { readOnly: boolean }) {
  const me = useKubi((s) => s.email)
  const load = useKubi((s) => s.load)
  const [preview, setPreview] = useState<MigrationPreview | null>(null)
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await task()
    } catch (e) {
      setMessage(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const analyse = () =>
    run(async () => {
      const p = await api<MigrationPreview>('POST', '/admin/migrate?dryRun=1')
      setPreview(p)
      // Nobody but the current user is kept unless ticked.
      setKept(new Set(p.emails.filter((e) => e === me)))
    })

  const migrate = () =>
    run(async () => {
      const request: MigrationRequest = { members: [...kept] }
      const r = await api<MigrationReport>('POST', '/admin/migrate', request)
      setMessage(`${r.operations} opérations, ${r.categories} catégories repris ; membres : ${r.members.join(', ')}.`)
      await load()
    })

  const toggle = (email: string) =>
    setKept((s) => {
      const next = new Set(s)
      if (!next.delete(email)) next.add(email)
      return next
    })

  return (
    <div className="flex flex-col items-start gap-2">
      <p>Vous utilisiez Kubi avant sa version serveur ? Reprenez le fichier kubi-data.json de ce dossier.</p>
      {!preview ? (
        <button className={btn.secondary} disabled={readOnly || busy} onClick={() => void analyse()}>
          Analyser kubi-data.json
        </button>
      ) : (
        <div className="bg-white border border-stone-200 rounded-lg p-3 flex flex-col gap-2 text-stone-700">
          <p>
            {preview.operations} opérations, {preview.categories} catégories, {preview.ignoredIds} doublons écartés, {preview.accountPlans} comptes de
            répartition.
          </p>
          <p>Comptes trouvés dans le fichier : cochez ceux qui gardent l’accès.</p>
          {preview.emails.map((email) => (
            <label key={email} className="flex items-center gap-2">
              <input type="checkbox" checked={email === me || kept.has(email)} disabled={email === me} onChange={() => toggle(email)} />
              {email}
              {email === me && <span className="text-xs text-stone-400">(vous)</span>}
            </label>
          ))}
          <p className="text-xs text-stone-500">Avant de lancer : arrêtez l’ancienne version de Kubi, pour qu’elle n’écrive plus dans ce fichier.</p>
          <div className="flex gap-2">
            <button className={btn.plain} disabled={busy} onClick={() => setPreview(null)}>
              Annuler
            </button>
            <button className={btn.primary} disabled={readOnly || busy} onClick={() => void migrate()}>
              Lancer la reprise
            </button>
          </div>
        </div>
      )}
      {message && <p>{message}</p>}
    </div>
  )
}
