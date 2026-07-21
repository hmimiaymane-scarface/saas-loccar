import { openDB, type DBSchema, type IDBPDatabase } from "idb"

/**
 * Roadmap phase 16 requirement 6 — the offline queue's storage layer.
 * This app has zero client-side persistence precedent anywhere before
 * this (confirmed by a full-repo grep during planning); `idb` (a tiny
 * promise wrapper over IndexedDB) is used rather than hand-rolling raw
 * IndexedDB's callback-based transaction API, which is genuinely
 * error-prone to get right for something this data-integrity-sensitive.
 *
 * Scope is deliberately narrow — the specific field workflows the
 * roadmap names (inspections, photo capture, document scanning,
 * signature capture), not a blanket offline mode. See
 * lib/offline/sync.ts for what actually drains this queue, and
 * docs/mobile.md for the full design (including why this only covers
 * *mid-flow* connectivity loss, not a cold app launch with zero
 * connectivity ever having occurred).
 */

export type MutationType =
  | "saveInspectionFields"
  | "attachInspectionMedia"
  | "completeInspection"
  | "createDamage"
  | "createDocumentRecord"
  | "addContractSignature"

export type MutationStatus = "pending" | "syncing" | "needs_review"

export interface QueuedMutation {
  /** Client-generated UUID — doubles as the idempotency key threaded
   * through to the three insert-type server actions that need one
   * (attachInspectionMedia/createDocumentRecord/createDamage). */
  id: string
  type: MutationType
  /** JSON-serializable arguments for the real server action — a
   * captured photo/signature isn't included here, it's a separate
   * `blobs` entry keyed by this same mutation id (IndexedDB stores
   * real Blobs natively; base64-encoding one into this payload would
   * bloat it for no reason). */
  payload: Record<string, unknown>
  createdAt: string
  status: MutationStatus
  retryCount: number
  /** Other mutation ids that must sync successfully first — e.g. a
   * photo upload must precede the inspection-complete call it's
   * required for. */
  dependsOn: string[]
  errorMessage?: string
}

export interface QueuedBlob {
  /** Matches the QueuedMutation.id that owns this file. */
  id: string
  blob: Blob
  fileName: string
  mimeType: string
}

interface OfflineDBSchema extends DBSchema {
  mutations: {
    key: string
    value: QueuedMutation
    indexes: { "by-createdAt": string }
  }
  blobs: {
    key: string
    value: QueuedBlob
  }
}

const DB_NAME = "rentalos-offline"
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null

function getDb(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const mutations = db.createObjectStore("mutations", { keyPath: "id" })
        mutations.createIndex("by-createdAt", "createdAt")
        db.createObjectStore("blobs", { keyPath: "id" })
      },
    })
  }
  return dbPromise
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/** Queues one mutation (and, when a file is passed, its blob) — called
 * from a workflow's own action wrapper the moment the employee acts,
 * whether or not the network is actually down (see lib/offline/sync.ts
 * for why: queue-then-drain-immediately is simpler and just as fast on
 * a good connection as calling the server action directly, and it's
 * the only way "started online, went offline mid-flow" behaves
 * identically to "was offline from the start"). */
export async function enqueueMutation(
  type: MutationType,
  payload: Record<string, unknown>,
  options: { dependsOn?: string[]; file?: { blob: Blob; fileName: string; mimeType: string } } = {}
): Promise<string> {
  const db = await getDb()
  const id = newId()
  const mutation: QueuedMutation = {
    id,
    type,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    dependsOn: options.dependsOn ?? [],
  }

  const tx = db.transaction(["mutations", "blobs"], "readwrite")
  await tx.objectStore("mutations").put(mutation)
  if (options.file) {
    await tx.objectStore("blobs").put({ id, blob: options.file.blob, fileName: options.file.fileName, mimeType: options.file.mimeType })
  }
  await tx.done

  return id
}

export async function listMutations(): Promise<QueuedMutation[]> {
  const db = await getDb()
  return db.getAllFromIndex("mutations", "by-createdAt")
}

export async function getBlob(mutationId: string): Promise<QueuedBlob | undefined> {
  const db = await getDb()
  return db.get("blobs", mutationId)
}

export async function updateMutation(id: string, patch: Partial<QueuedMutation>): Promise<void> {
  const db = await getDb()
  const existing = await db.get("mutations", id)
  if (!existing) return
  await db.put("mutations", { ...existing, ...patch })
}

export async function removeMutation(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(["mutations", "blobs"], "readwrite")
  await tx.objectStore("mutations").delete(id)
  await tx.objectStore("blobs").delete(id)
  await tx.done
}

export async function countPendingMutations(): Promise<number> {
  const mutations = await listMutations()
  return mutations.filter((m) => m.status === "pending" || m.status === "syncing").length
}

export async function countNeedsReviewMutations(): Promise<number> {
  const mutations = await listMutations()
  return mutations.filter((m) => m.status === "needs_review").length
}
