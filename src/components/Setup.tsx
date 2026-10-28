import { useEffect, useMemo, useState } from 'react'
import { ROOT_FOLDER, type DriveFolder } from '../drive/driveClient'
import { driveClient, useKubi } from '../state/store'
import { btn, input, messageOf } from './format'

/** First launch: the OAuth client ID, the Google sign-in, then the Drive folder. */
export function Setup({ signedIn, onSignedIn }: { signedIn: boolean; onSignedIn: () => void }) {
  const { clientId, setClientId, signIn } = useKubi()
  const [draft, setDraft] = useState(clientId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSignIn = async () => {
    setBusy(true)
    setError(null)
    try {
      await signIn()
      onSignedIn()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow w-full max-w-md p-6 flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Kubi</h1>
        {!clientId ? (
          <>
            <label className="text-sm text-stone-600">
              OAuth Client ID Google
              <input className={`${input} mt-1`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="…apps.googleusercontent.com" />
            </label>
            <button className={btn.primary} disabled={!draft.trim()} onClick={() => setClientId(draft)}>
              Continuer
            </button>
          </>
        ) : !signedIn ? (
          <>
            <p className="text-sm text-stone-600">Connectez-vous avec Google pour accéder au dossier Drive.</p>
            <button className={btn.primary} disabled={busy} onClick={() => void handleSignIn()}>
              Se connecter avec Google
            </button>
            <button className={btn.plain} onClick={() => setClientId('')}>
              Changer de Client ID
            </button>
          </>
        ) : (
          <FolderPicker />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}

function FolderPicker() {
  const setFolder = useKubi((s) => s.setFolder)
  const client = useMemo(() => driveClient(), [])
  const [path, setPath] = useState<DriveFolder[]>([ROOT_FOLDER])
  const [listing, setListing] = useState<{ id: string; folders: DriveFolder[] } | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const current = path[path.length - 1]

  useEffect(() => {
    let cancelled = false
    client.listFolders(current.id).then(
      (folders) => !cancelled && setListing({ id: current.id, folders }),
      (e: unknown) => !cancelled && setError(messageOf(e)),
    )
    return () => {
      cancelled = true
    }
  }, [client, current.id])

  const create = async () => {
    try {
      const folder = await client.createFolder(current.id, newName.trim())
      setNewName('')
      setPath([...path, folder])
    } catch (e) {
      setError(messageOf(e))
    }
  }

  return (
    <>
      <p className="text-sm text-stone-600">Choisissez le dossier Drive où Kubi stocke ses données et où vous déposez les exports bancaires.</p>
      <div className="text-sm flex flex-wrap gap-1">
        {path.map((f, i) => (
          <button key={f.id} className="text-emerald-700 hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>
            {f.name} /
          </button>
        ))}
      </div>
      <ul className="border border-stone-200 rounded-lg divide-y divide-stone-100 max-h-64 overflow-y-auto">
        {listing?.id !== current.id ? (
          <li className="p-2 text-sm text-stone-400">Chargement…</li>
        ) : listing.folders.length === 0 ? (
          <li className="p-2 text-sm text-stone-400">Aucun sous-dossier</li>
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
      <div className="flex gap-2">
        <input className={input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouveau dossier" />
        <button className={btn.secondary} disabled={!newName.trim()} onClick={() => void create()}>
          Créer
        </button>
      </div>
      <button className={btn.primary} disabled={current.id === ROOT_FOLDER.id} onClick={() => setFolder(current)}>
        Utiliser « {current.name} »
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  )
}
