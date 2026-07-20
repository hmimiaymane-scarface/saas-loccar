"use server"

import { requireSession, requireRole } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { extractDocument, type ExtractionResult } from "@/lib/document-extraction"

const EXTRACT_ROLES = ["owner", "manager", "agent"] as const

export async function extractDocumentAction(documentId: string): Promise<ExtractionResult> {
  const session = await requireSession()
  requireRole(session, [...EXTRACT_ROLES])
  const supabase = await createClient()
  return extractDocument(supabase, session.company.id, documentId)
}
