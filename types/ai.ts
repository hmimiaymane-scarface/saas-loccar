import type { AiProvider } from "@/lib/ai/models"

export type ProposedActionType =
  | "create_reservation"
  | "record_payment"
  | "cancel_reservation"
  | "schedule_maintenance"

export type ProposedActionStatus = "pending" | "confirmed" | "rejected" | "expired"

export interface ProposedAction {
  id: string
  conversationId: string
  actionType: ProposedActionType
  summary: string
  payload: Record<string, unknown>
  status: ProposedActionStatus
  createdAt: string
  resolvedAt: string | null
  resultId: string | null
}

export interface AiConversationSummary {
  id: string
  title: string | null
  provider: AiProvider
  updatedAt: string
}
