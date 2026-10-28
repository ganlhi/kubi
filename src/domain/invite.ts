/** What an invitation link carries: enough to land in the right Drive folder. Encoded, not encrypted — none of it is secret. */
export interface Invite {
  clientId: string
  folderId: string
  email: string
}

const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (code: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

export const encodeInvite = (invite: Invite): string =>
  toBase64Url(JSON.stringify({ c: invite.clientId, f: invite.folderId, e: invite.email }))

export function decodeInvite(code: string): Invite | null {
  try {
    const raw = JSON.parse(fromBase64Url(code)) as { c?: unknown; f?: unknown; e?: unknown }
    if (typeof raw.c !== 'string' || typeof raw.f !== 'string' || typeof raw.e !== 'string') return null
    return { clientId: raw.c, folderId: raw.f, email: raw.e }
  } catch {
    return null
  }
}
