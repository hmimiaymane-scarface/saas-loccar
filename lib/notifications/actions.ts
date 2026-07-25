import type { NotificationAction } from "@/types/rental"

/**
 * Shared shape for the common case: a customer-facing alert that can both
 * call the customer (when a real phone number is on file) and open the
 * relevant record. Never includes a "Call customer" action without a real
 * number — a NotificationAction is never a dead button for a channel
 * that isn't actually available (roadmap phase 18 requirement 2).
 */
export function callAndOpenActions(
  phone: string | null | undefined,
  openLabel: string,
  href: string
): NotificationAction[] {
  const actions: NotificationAction[] = []
  if (phone) actions.push({ label: "Call customer", href: `tel:${phone}`, kind: "call" })
  actions.push({ label: openLabel, href, kind: "link" })
  return actions
}
