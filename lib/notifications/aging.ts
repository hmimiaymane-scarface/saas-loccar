import type { InsightPriority } from "@/lib/tone"

/**
 * "Old unresolved issues should rise in priority over time rather than
 * getting buried under newer, less important ones" (roadmap phase 18
 * requirement 6). A single-step escalation after a named, documented
 * threshold — same convention as lib/operations-feed/thresholds.ts's
 * named constants — not a continuous curve. `critical` has nothing
 * above it to escalate to, so it's a no-op. Applied only to unresolved
 * (unread) items — see lib/data.ts#getNotificationFeed, which never ages
 * an item the user has already read/dismissed.
 */
export const AGING_THRESHOLD_DAYS: Record<Exclude<InsightPriority, "critical">, number> = {
  informational: 14,
  important: 7,
  operational: 3,
}

const ESCALATION: Record<InsightPriority, InsightPriority> = {
  informational: "important",
  important: "operational",
  operational: "critical",
  critical: "critical",
}

export function agePriority(priority: InsightPriority, createdAt: string, now: Date = new Date()): InsightPriority {
  if (priority === "critical") return priority
  const ageDays = (now.getTime() - new Date(createdAt).getTime()) / 86_400_000
  if (ageDays >= AGING_THRESHOLD_DAYS[priority]) return ESCALATION[priority]
  return priority
}
