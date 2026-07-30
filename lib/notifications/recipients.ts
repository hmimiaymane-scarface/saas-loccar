import type { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface NotificationRecipient {
  userId: string
}

/**
 * Roadmap phase 44 — "make RentalOS part of the OWNER's day" (the
 * phase brief's own framing). Shared by both push-worthy paths this
 * phase adds: the reminder cron (`lib/notifications/reminders.ts`) and
 * the event-triggered new-booking-request notification
 * (`app/(dashboard)/reservations/actions.ts`) — one query, not two
 * near-identical ones.
 */
export async function getOwnerManagerRecipients(
  supabase: SupabaseServerClient,
  companyId: string
): Promise<NotificationRecipient[]> {
  const { data, error } = await supabase
    .from("company_memberships")
    .select("user_id")
    .eq("company_id", companyId)
    .in("role", ["owner", "manager"])
  if (error) throw error
  return (data ?? []).map((row) => ({ userId: row.user_id }))
}
