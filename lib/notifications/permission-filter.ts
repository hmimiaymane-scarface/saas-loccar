import type { NotificationType } from "@/types/rental"

/**
 * Notification types that surface payment or financial figures — gated
 * behind the `view_financial_reports` permission (roadmap phase 18
 * requirement 7, building on phase 17's has_permission()). A role
 * without this permission (Cleaner, Mechanic by default) never receives
 * these at all, not a redacted version — the same "never see it" stance
 * phase 17 took for the underlying `payments`/`expenses` tables, applied
 * here to the notification layer built on top of them.
 */
export const FINANCIAL_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "outstanding_balance",
  "deposit_unresolved",
])

export function isFinancialNotificationType(type: NotificationType): boolean {
  return FINANCIAL_NOTIFICATION_TYPES.has(type)
}

/** @param hasFinancialAccess Whether the current session's role/override
 * grants `view_financial_reports` — resolved by the caller via
 * has_permission() (see lib/data.ts#getNotificationFeed). */
export function filterByFinancialAccess<T extends { type: NotificationType }>(
  items: readonly T[],
  hasFinancialAccess: boolean
): T[] {
  if (hasFinancialAccess) return [...items]
  return items.filter((item) => !isFinancialNotificationType(item.type))
}
