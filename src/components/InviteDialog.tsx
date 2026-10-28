import { useState } from 'react'
import { authorize } from '../domain/edits'
import { encodeInvite } from '../domain/invite'
import { driveClient, useKubi } from '../state/store'
import { Modal } from './ui'
import { btn, input, messageOf } from './format'

/** Share the Drive folder with someone and hand over a link that sets their app up. */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const { clientId, folder, mutate } = useKubi()
  const [email, setEmail] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invite = async () => {
    if (!folder) return
    const address = email.trim().toLowerCase()
    setBusy(true)
    setError(null)
    try {
      await driveClient().shareWith(folder.id, address)
      mutate((d) => authorize(d, address))
      const url = new URL(window.location.href)
      url.search = new URLSearchParams({ invite: encodeInvite({ clientId, folderId: folder.id, email: address }) }).toString()
      setLink(url.toString())
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Inviter quelqu’un" onClose={onClose}>
      {!link ? (
        <>
          <label className="text-sm">
            Email Google de la personne
            <input className={`${input} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <p className="text-xs text-stone-500">Le dossier Drive « {folder?.name} » sera partagé avec elle en écriture.</p>
          <div className="flex justify-end gap-2">
            <button className={btn.plain} onClick={onClose}>
              Annuler
            </button>
            <button className={btn.primary} disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => void invite()}>
              Partager et créer le lien
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">Dossier partagé. Envoyez-lui ce lien :</p>
          <input className={input} readOnly value={link} onFocus={(e) => e.target.select()} />
          <p className="text-xs text-orange-700">
            Étape manuelle : ajoutez {email.trim()} aux utilisateurs de test de l’écran de consentement OAuth dans la console Google
            Cloud, sinon la connexion lui sera refusée.
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn.secondary} onClick={() => void navigator.clipboard.writeText(link)}>
              Copier
            </button>
            <button className={btn.primary} onClick={onClose}>
              Fermer
            </button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Modal>
  )
}
