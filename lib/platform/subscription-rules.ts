import type { SubscriptionStatus } from "@/types/platform"

/**
 * Pure mirrors of the rules enforced by the platform SQL functions (see
 * supabase/migrations/20260721090300_platform_mutations.sql and
 * 20260721090400_platform_reads.sql) — kept here so the same threshold
 * can also drive a UI hint (e.g. flagging a trial row as "ending soon")
 * and so the rule is unit-testable without a live database. The
 * database is what actually enforces access; this module never decides
 * anything on its own.
 */

/** Mirrors is_company_suspended(): only these two statuses block
 * tenant access. 'trial' and 'active' never do. */
export function isAccountBlocked(status: SubscriptionStatus): boolean {
  return status === "suspended" || status === "cancelled"
}

/** Mirrors the trials_ending_soon window in platform_get_overview()
 * (a fixed 7-day default). Only meaningful for a trial subscription —
 * returns false for any other status regardless of the date. */
export function isTrialEndingSoon(
  status: SubscriptionStatus,
  trialEndsOn: string | null,
  today: string,
  thresholdDays = 7
): boolean {
  if (status !== "trial" || !trialEndsOn) return false
  const end = new Date(`${trialEndsOn}T00:00:00Z`).getTime()
  const start = new Date(`${today}T00:00:00Z`).getTime()
  const daysUntil = Math.round((end - start) / 86400000)
  return daysUntil >= 0 && daysUntil <= thresholdDays
}

/** A company can only be reactivated out of suspension — a cancelled
 * subscription is a deliberate end state the platform owner has to set
 * back to trial or active explicitly, not "reactivate" in place. */
export function canReactivate(status: SubscriptionStatus): boolean {
  return status === "suspended"
}
