import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { decodeInvite } from './domain/invite'
import { useKubi } from './state/store'

// An invitation link sets the app up for the shared folder, then gets out of the address bar.
const params = new URLSearchParams(window.location.search)
const invite = params.get('invite') && decodeInvite(params.get('invite')!)
if (invite) {
  useKubi.setState({ clientId: invite.clientId, folder: { id: invite.folderId, name: 'Dossier partagé' }, confirmed: null, pending: [] })
  window.history.replaceState(null, '', window.location.pathname)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
