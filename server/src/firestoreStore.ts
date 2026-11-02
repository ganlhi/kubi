/**
 * The store on Firestore. `meta/config` holds the version counter next to the
 * scalar fields of the data and the app's settings; every commit reads it in
 * its transaction, so two writes based on the same version cannot both land.
 */
import { FieldValue, type DocumentData, type Firestore, type Transaction } from 'firebase-admin/firestore'
import type { AccountPlan, Category, Operation } from '@kubi/domain/types'
import { assembleData, diffData, normalizeEmail, type Alert, type Meta, type Positioned, type Store, type Writes } from './store'

export function createFirestoreStore(db: Firestore): Store {
  const configRef = db.doc('meta/config')
  const lockRef = db.doc('locks/import')
  const col = (name: string) => db.collection(name)
  const docs = <T>(snap: { docs: { data(): DocumentData }[] }) => snap.docs.map((d) => d.data() as T)

  const write = <T extends object>(tx: Transaction, collection: string, writes: Writes<T>) => {
    for (const [id, doc] of writes) {
      if (doc === null) tx.delete(col(collection).doc(id))
      else tx.set(col(collection).doc(id), doc)
    }
  }

  return {
    version: async () => ((await configRef.get()).get('version') as number | undefined) ?? 0,

    load: () =>
      db.runTransaction(
        async (tx) => {
          const [config, operations, categories, ignoredIds, accountPlans, alerts] = await Promise.all([
            tx.get(configRef),
            tx.get(col('operations')),
            tx.get(col('categories')),
            tx.get(col('ignoredIds')),
            tx.get(col('accountPlans')),
            tx.get(col('alerts')),
          ])
          const c = config.data() ?? {}
          return {
            version: (c.version as number | undefined) ?? 0,
            meta: { folder: c.folder ?? null, lastImport: c.lastImport ?? null } satisfies Meta,
            alerts: alerts.docs.map((d) => ({ ...(d.data() as Omit<Alert, 'id'>), id: d.id })).sort((a, b) => a.at - b.at),
            data: assembleData({
              accountNumber: c.accountNumber as string | undefined,
              nextSeq: (c.nextSeq as number | undefined) ?? 0,
              operations: docs<Operation>(operations),
              categories: docs<Positioned<Category>>(categories),
              ignoredIds: docs<{ id: string }>(ignoredIds).map((x) => x.id),
              accountPlans: docs<Positioned<AccountPlan>>(accountPlans),
            }),
          }
        },
        { readOnly: true },
      ),

    commit: (expected, change) =>
      db.runTransaction(async (tx) => {
        const version = ((await tx.get(configRef)).get('version') as number | undefined) ?? 0
        if (version !== expected) return null
        const diff = diffData(change.before, change.after)
        write(tx, 'operations', diff.operations)
        write(tx, 'categories', diff.categories)
        write(tx, 'ignoredIds', diff.ignoredIds)
        write(tx, 'accountPlans', diff.accountPlans)
        const config: DocumentData = { version: version + 1, ...change.meta }
        if (diff.config.nextSeq !== undefined) config.nextSeq = diff.config.nextSeq
        if (diff.config.accountNumber !== undefined) config.accountNumber = diff.config.accountNumber ?? FieldValue.delete()
        tx.set(configRef, config, { merge: true })
        for (const a of change.addAlerts ?? []) tx.create(col('alerts').doc(), { ...a, dismissed: false })
        for (const id of change.dismissAlerts ?? []) tx.set(col('alerts').doc(id), { dismissed: true }, { merge: true })
        return version + 1
      }),

    members: async () => (await col('members').get()).docs.map((d) => d.id).sort(),
    isMember: async (email) => (await col('members').doc(normalizeEmail(email)).get()).exists,
    addMember: async (email, addedBy) => {
      await col('members').doc(normalizeEmail(email)).set({ addedBy, addedAt: Date.now() })
    },
    removeMember: async (email) => {
      await col('members').doc(normalizeEmail(email)).delete()
    },

    acquireLock: (owner, now, ttlMs) =>
      db.runTransaction(async (tx) => {
        const lock = (await tx.get(lockRef)).data() as { owner: string; expiresAt: number } | undefined
        if (lock && lock.owner !== owner && lock.expiresAt > now) return false
        tx.set(lockRef, { owner, expiresAt: now + ttlMs })
        return true
      }),
    releaseLock: (owner) =>
      db.runTransaction(async (tx) => {
        if ((await tx.get(lockRef)).get('owner') === owner) tx.delete(lockRef)
      }),
  }
}
