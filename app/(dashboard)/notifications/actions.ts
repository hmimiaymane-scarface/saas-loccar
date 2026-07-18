"use server"

import { revalidatePath } from "next/cache"

import { requireSession, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import type { NotificationType } from "@/types/rental"

export interface DismissLiveAlertInput {
  key: string
  type: NotificationType
  title: string
  description: string | null
  href: string | null
}

/** "Marking a live alert as read" has nothing to set read_at on — it's
 * recomputed, not stored — so this inserts a per-user dismissal marker
 * instead (see the `notifications` table's own comment). Idempotent: a
 * second dismissal of the same key is a no-op via the unique index. */
export async function dismissLiveAlert(input: DismissLiveAlertInput): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    const supabase = await createClient()

    const { error } = await supabase.from("notifications").insert({
      company_id: session.company.id,
      user_id: session.userId,
      type: input.type,
      key: input.key,
      title: input.title,
      description: input.description,
      link_href: input.href,
      read_at: new Date().toISOString(),
    })

    if (error && error.code !== "23505") return { error: friendlyDbError(error) }

    revalidatePath("/notifications")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function markNotificationRead(notificationId: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    const supabase = await createClient()

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", session.userId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/notifications")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Marks every currently-stored event as read, and — since a live alert
 * has no row to update — also inserts a dismissal marker for each
 * still-visible live alert the caller passes in (the page knows exactly
 * which ones are on screen; recomputing that here would just be the same
 * query run twice). */
export async function markAllNotificationsRead(liveAlerts: DismissLiveAlertInput[] = []): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    const supabase = await createClient()

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", session.userId)
      .is("read_at", null)
      .is("key", null)

    if (error) return { error: friendlyDbError(error) }

    if (liveAlerts.length > 0) {
      const { error: dismissError } = await supabase.from("notifications").insert(
        liveAlerts.map((a) => ({
          company_id: session.company.id,
          user_id: session.userId,
          type: a.type,
          key: a.key,
          title: a.title,
          description: a.description,
          link_href: a.href,
          read_at: new Date().toISOString(),
        }))
      )
      if (dismissError && dismissError.code !== "23505") return { error: friendlyDbError(dismissError) }
    }

    revalidatePath("/notifications")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
