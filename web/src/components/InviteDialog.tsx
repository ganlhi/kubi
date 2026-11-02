import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useKubi } from '../state/store'
import { Modal } from './ui'
import { btn, input, messageOf } from './format'

/** The accounts let into Kubi: add someone, then send them the app's address. */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const me = useKubi((s) => s.email)
  const [members, setMembers] = useState<string[] | null>(null)
  const [email, setEmail] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const appUrl = `${window.location.origin}${window.location.pathname}`

  useEffect(() => {
    api<string[]>('GET', '/members').then(setMembers, (e: unknown) => setError(messageOf(e)))
  }, [])

  const run = async (task: () => Promise<string[]>) => {
    setBusy(true)
    setError(null)
    try {
      setMembers(await task())
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  /** The whole data in the old file's format, to go back to the Drive-only app if need be. */
  const exportData = async () => {
    setError(null)
    try {
      const data = await api<unknown>('GET', '/admin/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `kubi-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(messageOf(e))
    }
  }

  const invite = () =>
    run(async () => {
      const address = email.trim().toLowerCase()
      const list = await api<string[]>('POST', '/members', { email: address })
      setAdded(address)
      setEmail('')
      return list
    })

  return (
    <Modal title="Membres" onClose={onClose}>
      <ul className="flex flex-col gap-1">
        {members === null ? (
          <li className="text-sm text-stone-400">Chargement…</li>
        ) : (
          members.map((m) => (
            <li key={m} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{m}</span>
              {m !== me && (
                <button
                  className={btn.plain}
                  disabled={busy}
                  title="Retirer l’accès"
                  onClick={() => void run(() => api<string[]>('DELETE', `/members/${encodeURIComponent(m)}`))}
                >
                  ✕
                </button>
              )}
            </li>
          ))
        )}
      </ul>
      <label className="text-sm">
        Inviter un compte Google
        <input
          className={`${input} mt-1`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && /^\S+@\S+\.\S+$/.test(email.trim()) && void invite()}
          autoFocus
        />
      </label>
      {added && (
        <>
          <p className="text-sm">{added} a maintenant accès. Envoyez-lui l’adresse de l’application :</p>
          <input className={input} readOnly value={appUrl} onFocus={(e) => e.target.select()} />
        </>
      )}
      <div className="flex justify-end gap-2">
        <button className={`${btn.plain} mr-auto`} onClick={() => void exportData()} title="Toutes les données, au format de kubi-data.json">
          Exporter les données
        </button>
        {added && (
          <button className={btn.secondary} onClick={() => void navigator.clipboard.writeText(appUrl)}>
            Copier l’adresse
          </button>
        )}
        <button className={btn.plain} onClick={onClose}>
          Fermer
        </button>
        <button className={btn.primary} disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => void invite()}>
          Ajouter
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Modal>
  )
}
