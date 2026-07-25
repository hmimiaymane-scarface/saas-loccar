"use server"

import { revalidatePath } from "next/cache"

import { requireSession, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import type { ApprovalRequestType } from "@/types/rental"

/**
 * Roadmap phase 17 — the employee-facing half of the approval workflow.
 * No role gate here on purpose: has_permission() at the RLS layer
 * already decides whether someone can act directly, without asking; if
 * they can't, this is the fallback. The RPCs (create_approval_request /
 * resolve_approval_request) are what actually enforce who can review.
 */
export async function requestApproval(
  type: ApprovalRequestType,
  entityType: string | null,
  entityId: string | null,
  payload: Record<string, unknown>,
  reason: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    const supabase = await createClient()

    if (!reason.trim()) throw new ActionError("A reason is required to request approval.")

    const { error } = await supabase.rpc("create_approval_request", {
      p_company_id: session.company.id,
      p_type: type,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_payload: payload,
      p_reason: reason,
    })

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/approvals")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function resolveApprovalRequest(
  requestId: string,
  decision: "approved" | "rejected",
  reason: string
): Promise<{ error?: string }> {
  try {
    await requireSession()
    const supabase = await createClient()

    if (!reason.trim()) throw new ActionError("A reason is required to approve or reject a request.")

    const { error } = await supabase.rpc("resolve_approval_request", {
      p_request_id: requestId,
      p_decision: decision,
      p_reason: reason,
    })

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/approvals")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
