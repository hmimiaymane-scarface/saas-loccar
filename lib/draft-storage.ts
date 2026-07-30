/**
 * Roadmap phase 43 (Error Recovery and Resilience) — "no data loss"
 * for typed-but-not-yet-submitted fields. Plain `localStorage`, no new
 * dependency — the same "no new infra for a modest-scale problem"
 * restraint the offline queue (phases 16/39) already established for
 * a related but distinct concern (that one durably queues a mutation
 * that's already been submitted; this one recovers what was typed
 * before submission ever happened). Deliberately three small pure
 * functions rather than a form-state library: this app has no shared
 * form-state abstraction to hook into — every wizard manages its own
 * fields as independent `useState` calls — so a caller reads a draft
 * once to seed its own initial state and writes it back on change,
 * rather than this module owning the fields itself.
 *
 * No expiry/TTL — a stale draft from weeks ago restoring is a minor,
 * acceptable quirk (the same trade-off most browsers' own form-restore
 * makes), not a gap worth solving with more moving parts here.
 */

export function readDraft<T>(key: string): Partial<T> | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as Partial<T>
  } catch {
    return null
  }
}

export function writeDraft<T>(key: string, value: Partial<T>): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full/disabled (private browsing, quota) — draft
    // persistence is a nice-to-have, never worth crashing over.
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Same as writeDraft above — best-effort only.
  }
}
