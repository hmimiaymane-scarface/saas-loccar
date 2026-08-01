"use server"

import { requireSession, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"

export interface SupportActionState {
  error?: string
  success?: boolean
}

/**
 * Roadmap phase 63 (Pilot Onboarding Package) — the feedback-capture
 * piece of the pilot onboarding package. Deliberately no role gate
 * beyond being a signed-in company member (unlike most mutations in
 * this app) — "tell us something's wrong" should never require asking
 * an owner/manager first. Follows this app's standing mutation
 * convention (calls createClient() unconditionally, throws
 * "Supabase is not configured" in mock mode) rather than the
 * fire-and-forget mock-aware shape lib/analytics/track.ts and
 * lib/observability/log.ts use — this is a real, user-initiated
 * submission that needs a real success/error result to show the
 * submitter, not silent best-effort telemetry.
 */
export async function submitFeedback(
  _prevState: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  try {
    const session = await requireSession()
    const supabase = await createClient()

    const message = requiredString(formData, "message", "Message")
    const pageContext = optionalString(formData, "pageContext")

    const { error } = await supabase.from("pilot_feedback").insert({
      company_id: session.company.id,
      submitted_by: session.userId,
      message,
      page_context: pageContext,
    })

    if (error) return { error: friendlyDbError(error) }

    return { success: true }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
