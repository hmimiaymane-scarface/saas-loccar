import { createClient } from "@/lib/supabase/server"
import { notify } from "@/lib/notifications/service"
import { callAndOpenActions } from "@/lib/notifications/actions"
import { getOwnerManagerRecipients, type NotificationRecipient } from "@/lib/notifications/recipients"
import { formatInTimeZone } from "@/lib/timezone"
import { getUpcomingReservationsMissingIdentityDocument } from "@/lib/customer-readiness-store"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const APPROACHING_WINDOW_HOURS = 2

/**
 * Roadmap phase 44 (Push Notifications). Four of this phase's five
 * priority conditions (late return, upcoming pickup, upcoming return,
 * outstanding balance) already existed as live-computed dashboard
 * values (`getLiveAlerts`, `lib/data.ts`) — deliberately never stored
 * as `notifications` rows, per that table's own migration comment
 * ("a permanent row would just be a second, easily-stale copy of the
 * truth"). Push can't work that way — a push has to fire at a real
 * point in time, there's no page being requested for it to recompute
 * against. This module is the bridge: it detects the same conditions
 * `getLiveAlerts` does (same filters, reused deliberately, not
 * reinvented) on a schedule (`app/api/cron/notification-reminders/route.ts`)
 * and calls `notify()` with `channels: ["push"]` **only** — never
 * `"in_app"` — so the `notifications` table's existing "state, not
 * stored events" design stays intact. `push_notification_log` (new
 * this phase, NOT the same mechanism as `notifications.key`'s
 * dismissal marker — see that migration's own comment) is the dedupe:
 * a unique `(user_id, dedupe_key)` violation means this exact
 * occurrence already got pushed, so `notify()` never runs twice for
 * the same still-ongoing condition.
 *
 * **Stated limitation**: dedupe is keyed on `type:entityId` alone — if
 * a reservation's pickup time changes *after* it already got pushed
 * once for entering the "approaching" window, it won't get a second
 * push for the new time. A finer key (incorporating the specific
 * pickup timestamp) would fix this at the cost of pushing again on
 * every reschedule, including a trivial few-minute adjustment — this
 * phase chose the simpler, quieter behavior deliberately, not by
 * oversight.
 */
export interface ReminderRunSummary {
  companyId: string
  overdueChecked: number
  balanceChecked: number
  pickupApproachingChecked: number
  returnApproachingChecked: number
  missingDocumentChecked: number
  pushed: number
}

/** Returns true only if this is a genuinely new occurrence (the
 * dedupe insert succeeded) — a unique-violation (23505) means this
 * exact key was already pushed to this user, a silent no-op, not an
 * error. */
async function claimDedupe(
  supabase: SupabaseServerClient,
  companyId: string,
  userId: string,
  dedupeKey: string
): Promise<boolean> {
  const { error } = await supabase.from("push_notification_log").insert({
    company_id: companyId,
    user_id: userId,
    dedupe_key: dedupeKey,
  })
  if (!error) return true
  if (error.code === "23505") return false
  throw error
}

async function pushToRecipients(
  supabase: SupabaseServerClient,
  companyId: string,
  recipients: NotificationRecipient[],
  dedupeKeyPrefix: string,
  entityId: string,
  payload: Omit<Parameters<typeof notify>[0], "recipients" | "channels" | "companyId">
): Promise<number> {
  let pushed = 0
  for (const recipient of recipients) {
    const claimed = await claimDedupe(supabase, companyId, recipient.userId, `${dedupeKeyPrefix}:${entityId}`)
    if (!claimed) continue
    await notify({ ...payload, companyId, recipients: [recipient], channels: ["push"] })
    pushed++
  }
  return pushed
}

export async function runNotificationRemindersForCompany(
  supabase: SupabaseServerClient,
  companyId: string,
  timezone: string
): Promise<ReminderRunSummary> {
  const recipients = await getOwnerManagerRecipients(supabase, companyId)
  const now = new Date()
  const windowEnd = new Date(now.getTime() + APPROACHING_WINDOW_HOURS * 3_600_000)
  let pushed = 0

  if (recipients.length === 0) {
    return {
      companyId,
      overdueChecked: 0,
      balanceChecked: 0,
      pickupApproachingChecked: 0,
      returnApproachingChecked: 0,
      missingDocumentChecked: 0,
      pushed: 0,
    }
  }

  // Late return — same filter as getLiveAlerts's own overdue query.
  const { data: overdueRows, error: overdueError } = await supabase
    .from("reservations")
    .select("id, reference, return_at, customer:customers(full_name, phone)")
    .eq("company_id", companyId)
    .eq("status", "active")
    .lt("return_at", now.toISOString())
    .limit(50)
  if (overdueError) throw overdueError

  for (const r of overdueRows ?? []) {
    const customer = r.customer as unknown as { full_name: string; phone: string | null } | null
    const href = `/reservations/${r.id}`
    pushed += await pushToRecipients(supabase, companyId, recipients, "rental_overdue", r.id, {
      type: "rental_overdue",
      priority: "critical",
      title: `${r.reference} is overdue for return`,
      description: `${customer?.full_name ?? "Customer"} — expected back ${formatInTimeZone(r.return_at, timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      linkHref: href,
      actions: callAndOpenActions(customer?.phone, "Open rental", href),
    })
  }

  // Outstanding balance — same filter as getLiveAlerts's own query.
  const { data: balanceRows, error: balanceError } = await supabase
    .from("reservations")
    .select("id, reference, remaining_balance, customer:customers(full_name, phone)")
    .eq("company_id", companyId)
    .in("status", ["active", "completed"])
    .gt("remaining_balance", 0)
    .limit(50)
  if (balanceError) throw balanceError

  for (const r of balanceRows ?? []) {
    const customer = r.customer as unknown as { full_name: string; phone: string | null } | null
    const href = `/reservations/${r.id}`
    pushed += await pushToRecipients(supabase, companyId, recipients, "outstanding_balance", r.id, {
      type: "outstanding_balance",
      priority: "important",
      title: `${r.reference} has an outstanding balance`,
      description: `${customer?.full_name ?? "Customer"} owes ${Number(r.remaining_balance)} MAD`,
      linkHref: href,
      actions: callAndOpenActions(customer?.phone, "Open rental", href),
    })
  }

  // Upcoming pickup — genuinely new detection, no prior code computed
  // this condition anywhere (see this module's own doc comment).
  const { data: pickupRows, error: pickupError } = await supabase
    .from("reservations")
    .select("id, reference, pickup_at, customer:customers(full_name, phone)")
    .eq("company_id", companyId)
    .in("status", ["pending", "confirmed"])
    .gte("pickup_at", now.toISOString())
    .lt("pickup_at", windowEnd.toISOString())
    .limit(50)
  if (pickupError) throw pickupError

  for (const r of pickupRows ?? []) {
    const customer = r.customer as unknown as { full_name: string; phone: string | null } | null
    const href = `/reservations/${r.id}/pickup`
    pushed += await pushToRecipients(supabase, companyId, recipients, "pickup_approaching", r.id, {
      type: "pickup_approaching",
      priority: "operational",
      title: `${r.reference} picks up soon`,
      description: `${customer?.full_name ?? "Customer"} — pickup at ${formatInTimeZone(r.pickup_at, timezone, { hour: "2-digit", minute: "2-digit" })}`,
      linkHref: href,
      actions: callAndOpenActions(customer?.phone, "Open pickup", href),
    })
  }

  // Upcoming return — same shape as pickup, also genuinely new.
  const { data: returnRows, error: returnError } = await supabase
    .from("reservations")
    .select("id, reference, return_at, customer:customers(full_name, phone)")
    .eq("company_id", companyId)
    .eq("status", "active")
    .gte("return_at", now.toISOString())
    .lt("return_at", windowEnd.toISOString())
    .limit(50)
  if (returnError) throw returnError

  for (const r of returnRows ?? []) {
    const customer = r.customer as unknown as { full_name: string; phone: string | null } | null
    const href = `/reservations/${r.id}/return`
    pushed += await pushToRecipients(supabase, companyId, recipients, "return_approaching", r.id, {
      type: "return_approaching",
      priority: "operational",
      title: `${r.reference} returns soon`,
      description: `${customer?.full_name ?? "Customer"} — return at ${formatInTimeZone(r.return_at, timezone, { hour: "2-digit", minute: "2-digit" })}`,
      linkHref: href,
      actions: callAndOpenActions(customer?.phone, "Open return", href),
    })
  }

  // Important missing document — reuses the exact function the
  // dashboard's own Needs Attention feed already computes this from
  // (lib/customer-readiness-store.ts), not a second implementation.
  const missingDocumentFlags = await getUpcomingReservationsMissingIdentityDocument(supabase, companyId)
  for (const flag of missingDocumentFlags) {
    const href = `/customers/${flag.customerId}`
    pushed += await pushToRecipients(supabase, companyId, recipients, "identity_document_missing", flag.reservationId, {
      type: "identity_document_missing",
      priority: "important",
      title: `${flag.customerName} is missing an identity document`,
      description: `Pickup ${formatInTimeZone(flag.pickupAt, timezone, { day: "numeric", month: "short" })} — no valid identity document on file yet.`,
      linkHref: href,
      actions: [{ label: "Open customer", href, kind: "link" }],
    })
  }

  return {
    companyId,
    overdueChecked: overdueRows?.length ?? 0,
    balanceChecked: balanceRows?.length ?? 0,
    pickupApproachingChecked: pickupRows?.length ?? 0,
    returnApproachingChecked: returnRows?.length ?? 0,
    missingDocumentChecked: missingDocumentFlags.length,
    pushed,
  }
}
