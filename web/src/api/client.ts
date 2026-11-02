/** Calls to the Kubi server, signed with the user's ID token. */
import { idToken } from '../auth/firebase'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The server's "you are signed in, but not a member" answer. */
export const NOT_MEMBER = 'not-member'

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = await idToken()
  if (!token) throw new ApiError(401, 'Connexion requise')
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      // A field set to undefined means "unset it", which JSON can only say with null.
      body: body === undefined ? undefined : JSON.stringify(body, (_k, v: unknown) => (v === undefined ? null : v)),
    })
  } catch {
    throw new ApiError(0, 'Serveur injoignable')
  }
  if (!res.ok) {
    let message = `Le serveur a répondu ${res.status}`
    try {
      const err = (await res.json()) as { error?: string }
      if (err.error) message = err.error
    } catch {
      // Not a JSON error body; the status is all we have.
    }
    throw new ApiError(res.status, message)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
