import { createClient } from "@/lib/supabase/server"
import type { NotificationChannel } from "./types"

/** The one channel required to work this phase (roadmap phase 18
 * requirement 4) — a plain insert into the existing `notifications`
 * table, the same shape public.notify() writes on the SQL side.
 *
 * Uses the ordinary session-bound client, so — same scope as
 * lib/activity-log.ts#recordEvent() — this only works for notifying the
 * *current* signed-in user; the `notifications` RLS insert policy is
 * `user_id = auth.uid()`. A background job notifying someone else needs
 * the service-role admin client (see lib/supabase/admin.ts, established
 * in phase 12) instead of this channel as written. */
export const inAppChannel: NotificationChannel = {
  id: "in_app",
  configured: true,
  async send(payload, recipient) {
    const supabase = await createClient()
    await supabase.from("notifications").insert({
      company_id: payload.companyId,
      user_id: recipient.userId,
      type: payload.type,
      key: payload.key ?? null,
      title: payload.title,
      description: payload.description ?? null,
      link_href: payload.linkHref ?? null,
      priority: payload.priority,
      actions: payload.actions as unknown as Record<string, unknown>[],
    })
  },
}
