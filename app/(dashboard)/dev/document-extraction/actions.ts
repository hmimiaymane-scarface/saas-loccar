"use server"

import { requireSession, requireRole } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import {
  extractDocument,
  classifyAndExtractDocument,
  type ExtractionResult,
  type ClassifyAndExtractResult,
} from "@/lib/document-extraction"
import { findDuplicateCandidates } from "@/lib/data"
import { getConsistencyIssuesForCustomer, type ConsistencyIssue } from "@/lib/document-consistency"
import type { DuplicateMatch } from "@/lib/customer-matching"

const EXTRACT_ROLES = ["owner", "manager", "agent"] as const

export async function extractDocumentAction(documentId: string): Promise<ExtractionResult> {
  const session = await requireSession()
  requireRole(session, [...EXTRACT_ROLES])
  const supabase = await createClient()
  return extractDocument(supabase, session.company.id, documentId)
}

/** Roadmap phase 04 requirement 1 demo: classify first, then extract
 * with whatever category was detected — see
 * lib/document-extraction.ts#classifyAndExtractDocument. */
export async function classifyAndExtractDocumentAction(documentId: string): Promise<ClassifyAndExtractResult> {
  const session = await requireSession()
  requireRole(session, [...EXTRACT_ROLES])
  const supabase = await createClient()
  return classifyAndExtractDocument(supabase, session.company.id, documentId)
}

/** Roadmap phase 04 requirement 5 demo. Mock-mode-aware (via
 * lib/data.ts), so this is the one action on this page that actually
 * produces a result without a live Supabase project. */
export async function checkDuplicateCandidatesAction(input: {
  fullName: string
  idDocumentNumber?: string
  licenseNumber?: string
}): Promise<DuplicateMatch[]> {
  const session = await requireSession()
  requireRole(session, [...EXTRACT_ROLES])
  return findDuplicateCandidates(session.company.id, input)
}

/** Roadmap phase 04 requirement 6 demo. Live-Supabase only — returns a
 * typed error instead of throwing so the page can render it inline. */
export async function checkConsistencyAction(customerId: string): Promise<ConsistencyIssue[] | { error: string }> {
  const session = await requireSession()
  requireRole(session, [...EXTRACT_ROLES])
  try {
    const supabase = await createClient()
    return await getConsistencyIssuesForCustomer(supabase, session.company.id, customerId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check consistency." }
  }
}
