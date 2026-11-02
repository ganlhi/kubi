import { useEffect, useState, type ReactNode } from 'react'
import type { Folder } from '@kubi/domain/api'
import { api } from '../api/client'
import { signIn, signOut } from '../auth/firebase'
import { useKubi } from '../state/store'
import { btn, messageOf } from './format'

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow w-full max-w-md p-6 flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Kubi</h1>
        {children}
      </div>
    </div>
  )
}

export function SignIn() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSignIn = async () => {
    setBusy(true)
    setError(null)
    try {
      await signIn()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <p className="text-sm text-stone-600">Connectez-vous avec votre compte Google.</p>
      <button className={btn.primary} disabled={busy} onClick={() => void handleSignIn()}>
        Se connecter avec Google
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Card>
  )
}

export function AccessDenied({ email }: { email: string }) {
  return (
    <Card>
      <p className="text-sm text-stone-600">
        Le compte <strong>{email}</strong> n’a pas accès à Kubi. Demandez à un membre de vous inviter, puis reconnectez-vous.
      </p>
      <button className={btn.secondary} onClick={() => void signOut()}>
        Changer de compte
      </button>
    </Card>
  )
}

/** Choosing the Drive folder the bank exports are dropped in, among those shared with the server. */
export function FolderSetup({ onCancel }: { onCancel?: () => void }) {
  const serviceAccountEmail = useKubi((s) => s.serviceAccountEmail)
  const setFolder = useKubi((s) => s.setFolder)
  const [path, setPath] = useState<Folder[]>([])
  const [listing, setListing] = useState<{ key: string; folders: Folder[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const current = path.at(-1)
  const key = `${current?.id ?? ''}#${refresh}`

  useEffect(() => {
    let cancelled = false
    api<Folder[]>('GET', `/drive/folders${current ? `?parent=${encodeURIComponent(current.id)}` : ''}`).then(
      (folders) => !cancelled && setListing({ key, folders }),
      (e: unknown) => !cancelled && setError(messageOf(e)),
    )
    return () => {
      cancelled = true
    }
  }, [current, key])

  const choose = async () => {
    if (!current) return
    setError(null)
    try {
      await setFolder(current.id)
      onCancel?.()
    } catch (e) {
      setError(messageOf(e))
    }
  }

  return (
    <Card>
      <p className="text-sm text-stone-600">
        Partagez en <strong>éditeur</strong> le dossier Google Drive où vous déposez les exports bancaires avec{' '}
        <code className="break-all select-all bg-stone-100 rounded px-1">{serviceAccountEmail}</code>, puis choisissez-le ci-dessous.
      </p>
      <div className="text-sm flex flex-wrap gap-1">
        <button className="text-emerald-700 hover:underline" onClick={() => setPath([])}>
          Dossiers partagés /
        </button>
        {path.map((f, i) => (
          <button key={f.id} className="text-emerald-700 hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>
            {f.name} /
          </button>
        ))}
      </div>
      <ul className="border border-stone-200 rounded-lg divide-y divide-stone-100 max-h-64 overflow-y-auto">
        {listing?.key !== key ? (
          <li className="p-2 text-sm text-stone-400">Chargement…</li>
        ) : listing.folders.length === 0 ? (
          <li className="p-2 text-sm text-stone-400">{current ? 'Aucun sous-dossier' : 'Aucun dossier partagé pour l’instant'}</li>
        ) : (
          listing.folders.map((f) => (
            <li key={f.id}>
              <button className="w-full text-left p-2 text-sm hover:bg-stone-50" onClick={() => setPath([...path, f])}>
                📁 {f.name}
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button className={btn.plain} onClick={onCancel}>
            Annuler
          </button>
        )}
        <button className={btn.secondary} onClick={() => setRefresh((n) => n + 1)}>
          Actualiser
        </button>
        <button className={btn.primary} disabled={!current} onClick={() => void choose()}>
          {current ? `Utiliser « ${current.name} »` : 'Choisissez un dossier'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Card>
  )
}
