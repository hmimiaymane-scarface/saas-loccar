import type { NotificationItem } from "@/types/rental"

/**
 * Roadmap phase 35 ("Notification Center Rebuild") — a structural
 * guarantee, not a bug fix for a currently-reproducible duplicate. No
 * caller in this codebase can double-fire the same notification today
 * (the two real `public.notify()` SQL callers are each keyed to a
 * unique approval-request id; the TS-side `notify()` has zero callers
 * yet) — but nothing stops a future one from doing so either, since
 * genuine one-off event rows (`key IS NULL`) have no uniqueness
 * constraint at the database level. This is the safety net: whatever
 * reaches `getNotificationFeed`, an owner never sees the same
 * conclusion twice.
 *
 * Two items are duplicates when they share both `type` and `href` —
 * the same kind of alert pointing at the same destination. Items with
 * no `href` (a null link) are never collapsed against each other just
 * because they're both null; nothing about "no destination" makes two
 * notifications the same thing.
 */
export function collapseDuplicateNotifications(items: NotificationItem[]): NotificationItem[] {
  const byKey = new Map<string, NotificationItem>()
  const withoutHref: NotificationItem[] = []

  for (const item of items) {
    if (!item.href) {
      withoutHref.push(item)
      continue
    }
    const key = `${item.type}:${item.href}`
    const existing = byKey.get(key)
    if (!existing || new Date(item.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      byKey.set(key, item)
    }
  }

  return [...byKey.values(), ...withoutHref]
}
