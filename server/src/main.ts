/**
 * The server as it runs on Cloud Run, or locally.
 *
 * Production (all set by the deploy):
 * - `GOOGLE_CLOUD_PROJECT`: the project, for Firestore and Firebase Auth.
 * - `DRIVE_SERVICE_ACCOUNT`: the service's own account, shown to users so they
 *   share the Drive folder with it.
 * - `SCHEDULER_SERVICE_ACCOUNT` and `SCHEDULER_AUDIENCE`: who may call
 *   `/internal/import`, and the audience its OIDC tokens carry.
 * - `BOOTSTRAP_ADMIN_EMAIL`: the first member, let in while there is none.
 *
 * Local development, with no GCP at all:
 * - `KUBI_DEV_EMAIL`: accept any token as this user; also keeps data in memory.
 * - `KUBI_DEV_DRIVE_DIR`: a directory standing in for Drive.
 */
import { serve } from '@hono/node-server'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { GoogleAuth, OAuth2Client } from 'google-auth-library'
import { createApp } from './app'
import { createDriveClient } from './driveClient'
import { createFirestoreStore } from './firestoreStore'
import { createLocalDrive } from './localDrive'
import { createMemoryStore } from './memoryStore'
import { createRepo } from './repo'

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined
const devEmail = env('KUBI_DEV_EMAIL')
const devDriveDir = env('KUBI_DEV_DRIVE_DIR')

function firestore() {
  initializeApp()
  const db = getFirestore()
  // Operations leave optional fields undefined; Firestore would refuse them.
  db.settings({ ignoreUndefinedProperties: true })
  return db
}

const store = devEmail ? createMemoryStore() : createFirestoreStore(firestore())

const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] })
const drive = devDriveDir
  ? createLocalDrive(devDriveDir)
  : createDriveClient(async () => {
      const token = await googleAuth.getAccessToken()
      if (!token) throw new Error('Pas de jeton d’accès Google pour le compte de service')
      return token
    })

const oidc = new OAuth2Client()

const app = createApp({
  store,
  repo: createRepo(store),
  drive,
  verifyUser: devEmail
    ? async () => devEmail
    : async (token) => {
        try {
          const decoded = await getAuth().verifyIdToken(token)
          return decoded.email && decoded.email_verified ? decoded.email : null
        } catch {
          return null
        }
      },
  verifyScheduler: async (token) => {
    const audience = env('SCHEDULER_AUDIENCE')
    const account = env('SCHEDULER_SERVICE_ACCOUNT')
    if (!audience || !account) return false
    try {
      const payload = (await oidc.verifyIdToken({ idToken: token, audience })).getPayload()
      return payload?.email === account && payload.email_verified === true
    } catch {
      return false
    }
  },
  serviceAccountEmail: env('DRIVE_SERVICE_ACCOUNT') ?? (devDriveDir ? `le dossier local ${devDriveDir}` : ''),
  bootstrapEmail: devEmail ?? env('BOOTSTRAP_ADMIN_EMAIL'),
})

const port = Number(env('PORT') ?? 8080)
serve({ fetch: app.fetch, port }, () => console.log(`kubi-api sur le port ${port}`))
