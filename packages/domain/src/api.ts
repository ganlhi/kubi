/** What the server answers, shared so both sides agree on it. */
import type { DataFile } from './types'

export interface Folder {
  id: string
  name: string
}

export interface AlertView {
  id: string
  message: string
  at: number
}

export interface ServerState {
  version: number
  data: DataFile
  /** The signed-in user. */
  email: string
  /** The Drive folder exports are imported from, once chosen. */
  folder: Folder | null
  lastImport: { at: number; added: number } | null
  /** Import problems still to acknowledge. */
  alerts: AlertView[]
  /** The account the Drive folder must be shared with. */
  serviceAccountEmail: string
}

/** `GET /api/data?version=N`: everything, unless nothing changed since version N. */
export type DataResponse = ({ unchanged: false } & ServerState) | { unchanged: true; version: number }

export interface ImportReport {
  /** Files imported, with how many new operations each brought. */
  imported: { name: string; added: number }[]
  /** Files left in place, and why. */
  alerts: string[]
  /** True when another import held the lock and nothing was tried. */
  busy: boolean
}

/** What the old data file holds, as `POST /api/admin/migrate?dryRun=1` finds it. */
export interface MigrationPreview {
  /**
   * The file's `authorizedEmails`. Not to be trusted as is: the old app added
   * anyone who opened it with access to the Drive folder.
   */
  emails: string[]
  operations: number
  categories: number
  ignoredIds: number
  accountPlans: number
}

/** Who becomes a member: an explicit list, or the file's emails minus some. Never the file's list unexamined. */
export type MigrationRequest = { members: string[] } | { exclude: string[] }

export type MigrationReport = Omit<MigrationPreview, 'emails'> & { members: string[] }
