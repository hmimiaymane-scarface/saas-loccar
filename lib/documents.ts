import { createClient } from "@/lib/supabase/server"
import { recordEvent } from "@/lib/activity-log"
import { fieldsContainText, type ExtractedFields } from "@/lib/document-extraction"
import type { DocumentCategory } from "@/types/rental"

export { CATEGORY_OPTIONS } from "@/lib/document-categories"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// ---------------------------------------------------------------------
// Document relationships & versioning (roadmap phase 04 requirements
// 2-3) — every document already links to a reservation/customer/vehicle
// (the `documents` schema has required this since phase 00, enforced by
// a check constraint), so the only new piece here is version chaining:
// uploading a renewed licence/insurance/registration for the same
// entity+category supersedes the previous one instead of leaving two
// unrelated "active" rows.
// ---------------------------------------------------------------------

export interface DocumentEntityLink {
  reservationId?: string | null
  customerId?: string | null
  vehicleId?: string | null
}

/** Which single entity a document is "primarily" about, for the
 * version-chain lookups below. A document can carry more than one FK,
 * but versioning only makes sense against one identity per category —
 * preferring customer, then vehicle, then reservation matches how the
 * four extractable categories are actually used (licence/ID/insurance
 * renewals are customer-linked; registration renewals are
 * vehicle-linked). */
export function resolveDocumentEntityColumn(
  link: DocumentEntityLink
): { column: "customer_id" | "vehicle_id" | "reservation_id"; id: string } | null {
  if (link.customerId) return { column: "customer_id", id: link.customerId }
  if (link.vehicleId) return { column: "vehicle_id", id: link.vehicleId }
  if (link.reservationId) return { column: "reservation_id", id: link.reservationId }
  return null
}

/** The id of the currently-active document (if any) that a new upload
 * of the same category, for the same entity, should supersede. Called
 * by createDocumentRecord() right before inserting — see
 * app/(dashboard)/documents/actions.ts. */
export async function findSupersededDocument(
  supabase: SupabaseServerClient,
  companyId: string,
  input: DocumentEntityLink & { category: DocumentCategory }
): Promise<string | null> {
  const entity = resolveDocumentEntityColumn(input)
  if (!entity) return null

  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("company_id", companyId)
    .eq("category", input.category)
    .eq("status", "active")
    .eq(entity.column, entity.id)
    .maybeSingle()

  if (error) throw error
  return (data?.id as string | undefined) ?? null
}

export interface DocumentVersionRow {
  id: string
  originalFilename: string
  status: "active" | "replaced" | "deleted"
  createdAt: string
  replacesDocumentId: string | null
}

/** Every version ever uploaded for one entity+category, newest first —
 * old versions are superseded (status flips to 'replaced'), never
 * deleted or overwritten, so this is always the full, retrievable
 * history. */
export async function getDocumentVersionHistory(
  supabase: SupabaseServerClient,
  companyId: string,
  input: DocumentEntityLink & { category: DocumentCategory }
): Promise<DocumentVersionRow[]> {
  const entity = resolveDocumentEntityColumn(input)
  if (!entity) return []

  const { data, error } = await supabase
    .from("documents")
    .select("id, original_filename, status, created_at, replaces_document_id")
    .eq("company_id", companyId)
    .eq("category", input.category)
    .eq(entity.column, entity.id)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    originalFilename: row.original_filename as string,
    status: row.status as DocumentVersionRow["status"],
    createdAt: row.created_at as string,
    replacesDocumentId: (row.replaces_document_id as string | null) ?? null,
  }))
}

// ---------------------------------------------------------------------
// Expiry monitoring (roadmap phase 04 requirement 4) — detection query
// and event emission only. Delivery (actually notifying anyone) is
// phase 18's job; this is what phase 12's AI Operations Feed will read.
// ---------------------------------------------------------------------

/** An ISO date (YYYY-MM-DD) `days` from now — the forward-looking
 * counterpart to lib/activity-log.ts#daysAgoIso. Pure so the threshold
 * boundary (e.g. "exactly N days out") is unit-testable without a
 * database. */
export function addDaysIsoDate(days: number, from: Date = new Date()): string {
  const result = new Date(from)
  result.setDate(result.getDate() + days)
  return result.toISOString().slice(0, 10)
}

export interface ExpiringDocument {
  id: string
  category: DocumentCategory
  originalFilename: string
  expiresOn: string
  customerId: string | null
  vehicleId: string | null
  reservationId: string | null
}

/** Every active document expiring within `days` days for this tenant —
 * including ones already expired, same "overdue counts as due"
 * convention as lib/alerts.ts#isWithinWarningWindow. */
export async function getExpiringDocuments(
  supabase: SupabaseServerClient,
  companyId: string,
  days: number,
  now: Date = new Date()
): Promise<ExpiringDocument[]> {
  const untilIso = addDaysIsoDate(days, now)

  const { data, error } = await supabase
    .from("documents")
    .select("id, category, original_filename, expires_on, customer_id, vehicle_id, reservation_id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .not("expires_on", "is", null)
    .lte("expires_on", untilIso)
    .order("expires_on", { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    category: row.category as DocumentCategory,
    originalFilename: row.original_filename as string,
    expiresOn: row.expires_on as string,
    customerId: (row.customer_id as string | null) ?? null,
    vehicleId: (row.vehicle_id as string | null) ?? null,
    reservationId: (row.reservation_id as string | null) ?? null,
  }))
}

/** Persists an expiry date detected by the extraction pipeline
 * (classifyAndExtractDocument's `expiryDate` field, for the categories
 * that have one) and emits the business event requirement 4 asks for.
 * Best-effort on the event, matching recordEvent's own convention —
 * only the column update's failure is reported back to the caller. */
export async function recordDetectedExpiry(
  supabase: SupabaseServerClient,
  companyId: string,
  documentId: string,
  expiresOn: string,
  filename: string
): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from("documents")
    .update({ expires_on: expiresOn })
    .eq("id", documentId)
    .eq("company_id", companyId)

  if (error) return { ok: false }

  await recordEvent(supabase, {
    companyId,
    actorId: null,
    actorType: "ai",
    type: "document_uploaded",
    entityType: "document",
    entityId: documentId,
    title: `Expiry detected: ${filename}`,
    description: `Expires ${expiresOn}`,
    metadata: { expires_on: expiresOn, detected: true },
    source: "background_job",
  })

  return { ok: true }
}

// ---------------------------------------------------------------------
// Search by extracted field (roadmap phase 04 requirement 7)
// ---------------------------------------------------------------------

/** Document ids whose latest completed extraction has a field value
 * containing `search` — licence number, plate, VIN, customer name, etc.
 * — not just the filename. JS-side substring match over a bounded batch
 * of extractions rather than a database-side JSONB text search, same
 * "no new infra for a modest-scale problem" call as the rest of this
 * pipeline (see docs/documents.md); the 1000-row cap is a known scaling
 * limit, not an oversight. */
export async function searchDocumentIdsByExtractedFields(
  supabase: SupabaseServerClient,
  companyId: string,
  search: string
): Promise<string[]> {
  const query = search.trim()
  if (!query) return []

  const { data, error } = await supabase
    .from("document_extractions")
    .select("document_id, fields")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1000)

  if (error) throw error

  const matches = new Set<string>()
  for (const row of data ?? []) {
    const fields = row.fields as ExtractedFields | null
    if (fields && fieldsContainText(fields, query)) matches.add(row.document_id as string)
  }
  return [...matches]
}
