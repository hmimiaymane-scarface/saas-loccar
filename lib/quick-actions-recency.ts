/**
 * Productization wave 2 phase 13 — "recently used actions may move
 * upward." This app's one existing client-side-persistence precedent
 * (`components/pwa/install-prompt.tsx`'s dismiss flag) is the pattern
 * to follow exactly: a single namespaced localStorage key, no server
 * round trip for a purely local UI preference. Ordering is keyed by
 * action label (stable across this file's own action-list edits,
 * unlike an array index) and capped at 5 so an old entry never
 * outlives every action it could apply to.
 */
const RECENT_KEY = "rentalos:quick-actions-recent"
const MAX_TRACKED = 5

export function loadRecentActionOrder(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

export function recordQuickActionUsage(label: string): void {
  try {
    const next = [label, ...loadRecentActionOrder().filter((l) => l !== label)].slice(0, MAX_TRACKED)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Private-browsing/storage-disabled: recency is a nice-to-have, the
    // action link itself already works regardless.
  }
}

/**
 * Orders `actions` by most-recently-used first, per `recentOrder`
 * (from `loadRecentActionOrder`). Actions with no recorded usage keep
 * their original relative order, appended after every used one — so
 * with an empty history (or before the client-only read has run) this
 * is simply the identity ordering, which is what both the server
 * render and the pre-effect client render already produce, avoiding a
 * hydration mismatch.
 */
export function orderByRecency<T extends { label: string }>(actions: T[], recentOrder: string[]): T[] {
  if (recentOrder.length === 0) return actions
  return [...actions].sort((a, b) => {
    const aIndex = recentOrder.indexOf(a.label)
    const bIndex = recentOrder.indexOf(b.label)
    if (aIndex === -1 && bIndex === -1) return 0
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
}
