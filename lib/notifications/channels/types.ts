import type { InsightPriority } from "@/lib/tone"
import type { NotificationAction, NotificationType } from "@/types/rental"

export interface NotificationChannelRecipient {
  userId: string
  email?: string | null
  phone?: string | null
}

export interface NotificationChannelPayload {
  companyId: string
  type: NotificationType
  title: string
  description?: string | null
  linkHref?: string | null
  priority: InsightPriority
  actions: NotificationAction[]
  /** Present only for a live-alert dismissal marker — see the
   * `notifications` table's own comment in
   * supabase/migrations/20260720090400_notifications.sql. */
  key?: string | null
}

export type NotificationChannelId = "in_app" | "email" | "whatsapp" | "sms" | "push"

/**
 * One delivery mechanism (roadmap phase 18 requirement 4 — "build the
 * service to be channel-agnostic internally"). `configured` is the
 * honest signal of whether this channel will actually attempt delivery:
 * `in_app` is the only channel required to work this phase; the rest
 * stay `false` until the owner sets up the real third-party credentials
 * they'd need (see lib/notifications/channels/unconfigured.ts).
 */
export interface NotificationChannel {
  id: NotificationChannelId
  configured: boolean
  send(payload: NotificationChannelPayload, recipient: NotificationChannelRecipient): Promise<void>
}
