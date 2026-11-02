/**
 * Signing in with a Google account, through Firebase Auth. The server checks
 * the ID token Firebase hands out on every request, and keeps the list of
 * accounts let in.
 *
 * With `VITE_DEV_EMAIL` set, nothing talks to Firebase: the app is signed in
 * as that address, for a local server started with `KUBI_DEV_EMAIL`.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type Auth } from 'firebase/auth'

export interface AuthUser {
  email: string
}

const env = import.meta.env
const DEV_EMAIL = ((env.VITE_DEV_EMAIL as string | undefined) ?? '').trim()

let auth: Auth | null = null
const firebaseAuth = (): Auth =>
  (auth ??= getAuth(
    initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY as string,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
      projectId: env.VITE_FIREBASE_PROJECT_ID as string,
      appId: env.VITE_FIREBASE_APP_ID as string,
    }),
  ))

/** Calls back with the signed-in user, or null, now and on every change. */
export function watchUser(callback: (user: AuthUser | null) => void): () => void {
  if (DEV_EMAIL) {
    callback({ email: DEV_EMAIL })
    return () => {}
  }
  return onAuthStateChanged(firebaseAuth(), (user) => callback(user?.email ? { email: user.email } : null))
}

export async function signIn(): Promise<void> {
  if (DEV_EMAIL) return
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(firebaseAuth(), provider)
}

export async function signOut(): Promise<void> {
  if (DEV_EMAIL) return
  await firebaseSignOut(firebaseAuth())
}

/** A fresh ID token for the server; Firebase renews it as it nears expiry. */
export async function idToken(): Promise<string | null> {
  if (DEV_EMAIL) return 'dev'
  return (await firebaseAuth().currentUser?.getIdToken()) ?? null
}
