import type { LiveAlert, Booking } from "@/types/rental"
import type { OperationsFeedItem } from "@/lib/operations-feed/data"
import type { InsightPriority } from "@/lib/tone"
import type { MissingIdentityDocumentFlag } from "@/lib/customer-readiness"

export type { MissingIdentityDocumentFlag }

/**
 * Productization wave 1 phase 11 — the owner Home screen's "Needs You
 * Now" section. Merges five previously-separate sources (live alerts,
 * the operations feed's critical/operational tiers, booking requests
 * awaiting a decision, contracts awaiting signature, customers missing
 * an identity document before an upcoming pickup) into one sorted,
 * always-actioned list, so nothing "needs attention" silently without
 * a real next step — the same non-negotiable phase 18 established for
 * notifications ("never information alone").
 *
 * Mirrors lib/data.ts's own private `URGENCY_TO_PRIORITY` mapping
 * rather than importing it — same call lib/mobile/mission-feed-data.ts
 * already made for a similarly small, single-purpose constant: keeping
 * this module a plain, zero-Supabase-dependency pure function (per this
 * repo's "pure functions first" testing convention) matters more here
 * than avoiding three duplicated lines.
 */
const ALERT_URGENCY_TO_PRIORITY: Record<LiveAlert["urgency"], InsightPriority> = {
  overdue: "critical",
  due_now: "operational",
  due_soon: "important",
}

const PRIORITY_RANK: Record<InsightPriority, number> = {
  critical: 0,
  operational: 1,
  important: 2,
  informational: 3,
}

export interface AttentionCard {
  id: string
  priority: InsightPriority
  title: string
  description: string
  actionLabel: string
  actionHref: string
  /** Only true for operations-feed-sourced cards — they're the only
   * ones backed by a real `operations_feed_items` row to dismiss. */
  dismissible: boolean
}

export interface ContractAwaitingSignatureSummary {
  id: string
  contractNumber: string | null
  customerName: string
  vehicleLabel: string | null
}

export interface NeedsAttentionInput {
  alerts: LiveAlert[]
  feedItems: OperationsFeedItem[]
  bookingRequests: Booking[]
  contractsAwaitingSignature: ContractAwaitingSignatureSummary[]
  missingDocuments: MissingIdentityDocumentFlag[]
}

function formatPickupDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/**
 * No per-alert-type filtering — every `LiveAlert` the company has today
 * (late return, outstanding balance, expiring insurance/registration,
 * vehicle unavailable, maintenance, damage, etc.) flows through
 * uniformly with its own already-good title/description. The brief's
 * named card list is illustrative ("may include"), not an exclusive
 * whitelist.
 */
export function buildNeedsAttentionFeed(input: NeedsAttentionInput): AttentionCard[] {
  const alertCards: AttentionCard[] = input.alerts.map((alert) => ({
    id: alert.key,
    priority: ALERT_URGENCY_TO_PRIORITY[alert.urgency],
    title: alert.title,
    description: alert.description,
    actionLabel: alert.actions[0]?.label ?? "View",
    actionHref: alert.actions[0]?.href ?? alert.href,
    dismissible: false,
  }))

  const feedCards: AttentionCard[] = input.feedItems
    .filter((item) => item.priorityTier === "critical" || item.priorityTier === "operational")
    .map((item) => ({
      id: item.id,
      priority: item.priorityTier === "critical" ? "critical" : "operational",
      title: item.observation,
      description: `${item.reasoning} ${item.suggestedAction}`.trim(),
      actionLabel: item.actionLabel,
      actionHref: item.actionHref,
      dismissible: true,
    }))

  const bookingCards: AttentionCard[] = input.bookingRequests.map((booking) => ({
    id: `booking-request:${booking.id}`,
    priority: "operational",
    title: `${booking.customer.fullName} wants to book`,
    description: booking.vehicle
      ? `${booking.vehicle.make} ${booking.vehicle.model}, ${booking.startDate} – ${booking.endDate}. Awaiting your decision.`
      : `${booking.requestedCategory ?? "A vehicle"}, ${booking.startDate} – ${booking.endDate}. Awaiting your decision.`,
    actionLabel: "Review request",
    actionHref: `/reservations/${booking.id}`,
    dismissible: false,
  }))

  const contractCards: AttentionCard[] = input.contractsAwaitingSignature.map((contract) => ({
    id: `contract-signature:${contract.id}`,
    priority: "operational",
    title: "Contract awaiting signature",
    description: contract.vehicleLabel
      ? `${contract.customerName} — ${contract.vehicleLabel}${contract.contractNumber ? ` (${contract.contractNumber})` : ""}`
      : contract.customerName,
    actionLabel: "Review & sign",
    actionHref: `/contracts/${contract.id}`,
    dismissible: false,
  }))

  const missingDocumentCards: AttentionCard[] = input.missingDocuments.map((flag) => ({
    id: `missing-document:${flag.customerId}`,
    priority: "critical",
    title: "Missing identity document",
    description: `${flag.customerName} picks up on ${formatPickupDate(flag.pickupAt)} with no valid ID on file.`,
    actionLabel: "Upload document",
    actionHref: `/customers/${flag.customerId}`,
    dismissible: false,
  }))

  return [...alertCards, ...feedCards, ...bookingCards, ...contractCards, ...missingDocumentCards].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  )
}
