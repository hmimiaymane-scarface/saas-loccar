"use server"

import { revalidatePath } from "next/cache"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { generateObject } from "ai"
import { z } from "zod"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { createReservation } from "@/app/(dashboard)/reservations/actions"
import { recordPayment } from "@/app/(dashboard)/payments/actions"
import { updateReservationStatus } from "@/app/(dashboard)/reservations/actions"
import { createMaintenance } from "@/app/(dashboard)/maintenance/actions"
import { getLiveAlerts, getOverviewMetrics } from "@/lib/data"
import { resolveModel, isConfigured, type AiProvider } from "@/lib/ai/models"
import { AI_PROVIDERS } from "@/lib/ai/models"
import type { ProposedAction } from "@/types/ai"

const OWNER_MANAGER = ["owner", "manager"] as const

export interface ConversationSummaryRow {
  id: string
  title: string | null
  provider: AiProvider
  updatedAt: string
}

export async function listConversations(): Promise<ConversationSummaryRow[]> {
  const session = await requireSession()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, provider, updated_at")
    .eq("user_id", session.userId)
    .order("updated_at", { ascending: false })
    .limit(30)

  if (error) throw error
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    provider: c.provider as AiProvider,
    updatedAt: c.updated_at,
  }))
}

export interface StoredMessage {
  id: string
  role: "user" | "assistant" | "tool"
  content: string | null
  createdAt: string
}

export async function getConversationMessages(conversationId: string): Promise<StoredMessage[]> {
  const session = await requireSession()
  const supabase = await createClient()

  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", session.userId)
    .maybeSingle()
  if (!conversation) return []

  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role as StoredMessage["role"],
    content: m.content,
    createdAt: m.created_at,
  }))
}

export async function getProposedActions(conversationId: string): Promise<ProposedAction[]> {
  const session = await requireSession()
  const supabase = await createClient()

  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", session.userId)
    .maybeSingle()
  if (!conversation) return []

  const { data, error } = await supabase
    .from("ai_proposed_actions")
    .select("id, conversation_id, action_type, summary, payload, status, created_at, resolved_at, result_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    conversationId: p.conversation_id,
    actionType: p.action_type as ProposedAction["actionType"],
    summary: p.summary,
    payload: p.payload as Record<string, unknown>,
    status: p.status as ProposedAction["status"],
    createdAt: p.created_at,
    resolvedAt: p.resolved_at,
    resultId: p.result_id,
  }))
}

export async function createConversation(provider: AiProvider): Promise<{ conversationId?: string; error?: string }> {
  try {
    const session = await requireSession()
    if (!AI_PROVIDERS.includes(provider)) throw new ActionError("Invalid provider.")
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ company_id: session.company.id, user_id: session.userId, provider })
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }
    revalidatePath("/ai-assistant")
    return { conversationId: data.id as string }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function deleteConversation(conversationId: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    const supabase = await createClient()
    const { error } = await supabase
      .from("ai_conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", session.userId)

    if (error) return { error: friendlyDbError(error) }
    revalidatePath("/ai-assistant")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Marks a proposal resolved without running the real action — used for
 * both an explicit reject and for the "never mind" path. */
export async function rejectProposedAction(proposalId: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    const supabase = await createClient()
    const { error } = await supabase
      .from("ai_proposed_actions")
      .update({ status: "rejected", resolved_at: new Date().toISOString(), resolved_by: session.userId })
      .eq("id", proposalId)
      .eq("status", "pending")

    if (error) return { error: friendlyDbError(error) }
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

async function loadPendingProposal(proposalId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ai_proposed_actions")
    .select("*")
    .eq("id", proposalId)
    .eq("status", "pending")
    .maybeSingle()
  if (error) throw new ActionError(friendlyDbError(error))
  if (!data) throw new ActionError("This proposal is no longer pending — it may already have been resolved.")
  return data
}

async function markResolved(proposalId: string, userId: string, resultId?: string) {
  const supabase = await createClient()
  await supabase
    .from("ai_proposed_actions")
    .update({ status: "confirmed", resolved_at: new Date().toISOString(), resolved_by: userId, result_id: resultId ?? null })
    .eq("id", proposalId)
}

/**
 * The one place every AI-proposed write actually happens — and it
 * happens by calling the exact same server action a human clicking the
 * matching button in the app would call, with the exact same
 * requireSession()/requireRole() checks. This function adds no new
 * privilege; it only translates a stored proposal payload into the
 * FormData/args shape the real action already expects, and reports
 * whatever that action decides.
 */
export async function confirmProposedAction(proposalId: string): Promise<{ error?: string; resultPath?: string }> {
  try {
    await requireSession()
    const proposal = await loadPendingProposal(proposalId)
    const payload = proposal.payload as Record<string, unknown>

    switch (proposal.action_type) {
      case "create_reservation": {
        const formData = new FormData()
        if (payload.customerId) formData.set("customerId", String(payload.customerId))
        if (payload.quickCustomerName) formData.set("quickCustomerName", String(payload.quickCustomerName))
        if (payload.quickCustomerPhone) formData.set("quickCustomerPhone", String(payload.quickCustomerPhone))
        formData.set("vehicleId", payload.vehicleId ? String(payload.vehicleId) : "")
        formData.set("requestedCategory", payload.vehicleId ? "" : String(payload.requestedCategory ?? ""))
        formData.set("pickupAt", String(payload.pickupAtLocal ?? ""))
        formData.set("returnAt", String(payload.returnAtLocal ?? ""))
        formData.set("dailyRate", String(payload.dailyRateMad ?? ""))
        formData.set("source", "other")
        formData.set("status", "request")
        formData.set("notes", "Created via AI assistant, confirmed by a team member.")

        try {
          const result = await createReservation({}, formData)
          return { error: result.error ?? "Could not create the reservation." }
        } catch (err) {
          if (isRedirectError(err)) {
            await markResolved(proposalId, (await requireSession()).userId)
            throw err
          }
          throw err
        }
      }

      case "record_payment": {
        const formData = new FormData()
        formData.set("customerId", String(payload.customerId ?? ""))
        formData.set("reservationId", String(payload.reservationId ?? ""))
        formData.set("transactionType", String(payload.transactionType ?? "rental_payment"))
        formData.set("amount", String(payload.amountMad ?? ""))
        formData.set("method", String(payload.method ?? "cash"))
        if (payload.notes) formData.set("notes", String(payload.notes))

        const result = await recordPayment({}, formData)
        if (result.error) return { error: result.error }
        await markResolved(proposalId, (await requireSession()).userId)
        return { resultPath: `/reservations/${payload.reservationId}` }
      }

      case "cancel_reservation": {
        const result = await updateReservationStatus(String(payload.reservationId), "cancelled")
        if (result.error) return { error: result.error }
        await markResolved(proposalId, (await requireSession()).userId)
        return { resultPath: `/reservations/${payload.reservationId}` }
      }

      case "schedule_maintenance": {
        const formData = new FormData()
        formData.set("vehicleId", String(payload.vehicleId ?? ""))
        formData.set("type", String(payload.type ?? "other"))
        formData.set("priority", String(payload.priority ?? "normal"))
        formData.set("status", "scheduled")
        if (payload.scheduledOn) formData.set("scheduledOn", String(payload.scheduledOn))
        if (payload.description) formData.set("description", String(payload.description))
        if (payload.estimatedCostMad != null) formData.set("estimatedCost", String(payload.estimatedCostMad))

        const result = await createMaintenance({}, formData)
        if (result.error) return { error: result.error }
        const session = await requireSession()
        await markResolved(proposalId, session.userId, result.maintenanceId)
        return { resultPath: `/maintenance/${result.maintenanceId}` }
      }

      default:
        return { error: "Unknown proposal type." }
    }
  } catch (err) {
    if (isRedirectError(err)) throw err
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Fire-and-forget persistence for conversation history — called by the
 * client once per finished message (both the user's and the
 * assistant's), separate from the streaming response itself so the
 * chat route stays a plain stream with no DB round-trip in the
 * critical path. */
export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    const supabase = await createClient()

    const { error } = await supabase.from("ai_messages").insert({ conversation_id: conversationId, role, content })
    if (error) return { error: friendlyDbError(error) }

    // Title the conversation from the first user message, and bump
    // updated_at so the sidebar sorts by recency.
    const { data: existing } = await supabase
      .from("ai_conversations")
      .select("title")
      .eq("id", conversationId)
      .eq("user_id", session.userId)
      .maybeSingle()

    await supabase
      .from("ai_conversations")
      .update({
        updated_at: new Date().toISOString(),
        ...(role === "user" && !existing?.title ? { title: content.slice(0, 80) } : {}),
      })
      .eq("id", conversationId)
      .eq("user_id", session.userId)

    revalidatePath("/ai-assistant")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export interface Suggestion {
  title: string
  detail: string
}

const suggestionsSchema = z.object({
  suggestions: z
    .array(z.object({ title: z.string(), detail: z.string() }))
    .max(4)
    .describe("2 to 4 short, concrete, actionable suggestions for the owner — nothing generic."),
})

/**
 * On-demand only — no background job or polling. Owner/manager only,
 * since it reasons over company-wide financial and operational state.
 * Purely informational: this never proposes an action directly, it just
 * points at something worth doing; acting on it still goes through the
 * normal chat (and from there, the same propose/confirm flow as
 * everything else).
 */
export async function generateSuggestions(): Promise<{ suggestions?: Suggestion[]; error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...OWNER_MANAGER])

    const provider = isConfigured("anthropic") ? "anthropic" : isConfigured("openai") ? "openai" : null
    if (!provider) throw new ActionError("No AI provider is configured yet.")

    const [alerts, metrics] = await Promise.all([
      getLiveAlerts(session.company.id, {
        maintenanceReminderDays: session.company.maintenanceReminderDays,
        documentExpiryWarningDays: session.company.documentExpiryWarningDays,
        overdueGracePeriodHours: session.company.overdueGracePeriodHours,
      }),
      getOverviewMetrics(session.company.id),
    ])

    const context = [
      `Needs attention (${alerts.length}): ${alerts.map((a) => a.title).join("; ") || "nothing"}`,
      `Revenue today: ${metrics.revenueTodayMad} MAD, this month: ${metrics.revenueThisMonthMad} MAD`,
      `Outstanding balance: ${metrics.outstandingBalanceMad} MAD`,
      `Fleet: ${metrics.fleetAvailable}/${metrics.fleetTotal} available, ${metrics.fleetRented} rented, ${metrics.fleetMaintenance} in maintenance`,
    ].join("\n")

    const { object } = await generateObject({
      model: resolveModel(provider),
      schema: suggestionsSchema,
      prompt: `You are looking at today's snapshot for a small car rental company. Based only on this data, suggest 2-4 short, concrete things worth doing today. Skip anything not actually supported by the data below — no generic advice.\n\n${context}`,
    })

    return { suggestions: object.suggestions }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
