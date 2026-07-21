import { createClient } from "@/lib/supabase/server"
import { normalizeName } from "@/lib/customer-matching"
import type { ExtractedFields } from "@/lib/document-extraction"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Cross-document consistency checks (roadmap phase 04 requirement 6):
 * when a customer has multiple identity documents (e.g. a passport and a
 * driving licence), flag mismatches — different name spelling, different
 * birth date — as a review item rather than silently trusting whichever
 * was uploaded last. Only identity_document and driving_licence carry a
 * `fullName` field (see lib/document-extraction.ts's schemas); only
 * identity_document carries `birthDate` — but this module doesn't need
 * to know that, it just looks at whatever fields are actually present.
 */

export interface DocumentFieldSnapshot {
  documentId: string
  category: string
  fullName: string | null
  birthDate: string | null
}

export interface ConsistencyIssue {
  field: "fullName" | "birthDate"
  values: { documentId: string; category: string; value: string }[]
}

/** Pulls just the two fields consistency checks care about out of a raw
 * extraction's `fields` jsonb — null when the category's schema doesn't
 * have that field (or the model didn't return a string for it). */
export function snapshotFromFields(documentId: string, category: string, fields: ExtractedFields): DocumentFieldSnapshot {
  const fullName = fields.fullName?.value
  const birthDate = fields.birthDate?.value
  return {
    documentId,
    category,
    fullName: typeof fullName === "string" ? fullName : null,
    birthDate: typeof birthDate === "string" ? birthDate : null,
  }
}

/** Any spelling difference counts — unlike duplicate-customer matching
 * (which fuzzy-scores similarity), a mismatch across a single customer's
 * own documents is inherently suspicious even for a near-miss, so this
 * flags on normalized inequality rather than a similarity threshold. */
export function findNameMismatches(snapshots: DocumentFieldSnapshot[]): ConsistencyIssue[] {
  const present = snapshots.filter((s): s is DocumentFieldSnapshot & { fullName: string } => s.fullName != null)
  if (present.length < 2) return []

  const distinct = new Set(present.map((s) => normalizeName(s.fullName)))
  if (distinct.size <= 1) return []

  return [
    {
      field: "fullName",
      values: present.map((s) => ({ documentId: s.documentId, category: s.category, value: s.fullName })),
    },
  ]
}

export function findBirthDateMismatches(snapshots: DocumentFieldSnapshot[]): ConsistencyIssue[] {
  const present = snapshots.filter((s): s is DocumentFieldSnapshot & { birthDate: string } => s.birthDate != null)
  if (present.length < 2) return []

  const distinct = new Set(present.map((s) => s.birthDate.trim()))
  if (distinct.size <= 1) return []

  return [
    {
      field: "birthDate",
      values: present.map((s) => ({ documentId: s.documentId, category: s.category, value: s.birthDate })),
    },
  ]
}

export function findConsistencyIssues(snapshots: DocumentFieldSnapshot[]): ConsistencyIssue[] {
  return [...findNameMismatches(snapshots), ...findBirthDateMismatches(snapshots)]
}

/** The database-facing wrapper: every active document a customer has,
 * each reduced to its latest completed extraction, checked against each
 * other. A document with no completed extraction yet (or none at all)
 * simply contributes nothing — this only flags what's actually been
 * read, never blocks on missing data. */
export async function getConsistencyIssuesForCustomer(
  supabase: SupabaseServerClient,
  companyId: string,
  customerId: string
): Promise<ConsistencyIssue[]> {
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, category")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .eq("status", "active")

  if (docsError) throw docsError
  const documentIds = (docs ?? []).map((d) => d.id as string)
  if (documentIds.length === 0) return []

  const { data: extractions, error: extractionsError } = await supabase
    .from("document_extractions")
    .select("document_id, category, fields, created_at")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .in("document_id", documentIds)
    .order("created_at", { ascending: false })

  if (extractionsError) throw extractionsError

  // Rows are newest-first, so the first time we see a document_id is
  // its latest completed extraction.
  const latestByDocument = new Map<string, { category: string; fields: ExtractedFields }>()
  for (const row of extractions ?? []) {
    const documentId = row.document_id as string
    if (!latestByDocument.has(documentId)) {
      latestByDocument.set(documentId, { category: row.category as string, fields: row.fields as ExtractedFields })
    }
  }

  const snapshots = [...latestByDocument.entries()].map(([documentId, { category, fields }]) =>
    snapshotFromFields(documentId, category, fields)
  )

  return findConsistencyIssues(snapshots)
}
