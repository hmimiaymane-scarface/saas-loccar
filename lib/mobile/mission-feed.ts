import type { BookingStatus } from "@/types/rental"
import type { PriorityTier } from "@/lib/operations-feed/types"

/**
 * Roadmap phase 16 requirement 2 — "Home screen as mission feed, not
 * dashboard: today's assigned work as actionable cards (customer
 * arriving soon, return overdue, inspection waiting, contract ready to
 * sign, document uploaded)." Pure-first, same split every prior phase
 * this session used: this module knows nothing about Supabase, only
 * about today's already-fetched reservations and the phase-12
 * operations feed's own already-reasoned items — see
 * lib/mobile/mission-feed-data.ts for the thin DB layer that gathers
 * those inputs and calls this.
 */

export interface MissionReservationInput {
  id: string
  reference: string
  customerName: string
  vehicleLabel: string | null
  status: BookingStatus
  /** ISO timestamps — always present even when pickup/return isn't due
   * today, so "soon" (within 2 hours) can be computed precisely. */
  pickupAt: string
  returnAt: string
  pickupDueToday: boolean
  returnDueToday: boolean
  hasPickupInspection: boolean
  hasCompletedPickupInspection: boolean
  hasCompletedReturnInspection: boolean
  contractAwaitingSignature: boolean
}

export interface MissionFeedItemInput {
  id: string
  observation: string
  actionLabel: string
  actionHref: string
  priorityTier: PriorityTier
}

/** Roadmap phase 17 — cleaner/mechanic's mission feed is built from
 * their assigned (or unassigned) maintenance_records rows instead of
 * reservations; see lib/mobile/mission-feed-data.ts for which query
 * runs per role. Every other role's feed is unaffected — this input is
 * simply empty for them, same as `feedItems` already is in mock mode. */
export interface MissionMaintenanceInput {
  id: string
  vehicleLabel: string
  type: string
  priority: "low" | "normal" | "high" | "urgent"
  status: string
  scheduledOn: string | null
}

export type MissionCardTone = "critical" | "operational" | "informational"

export interface MissionCard {
  id: string
  title: string
  subtitle: string
  href: string
  tone: MissionCardTone
}

const TONE_ORDER: Record<MissionCardTone, number> = { critical: 0, operational: 1, informational: 2 }

/** A pickup within this many hours reads as "arriving soon" rather
 * than just "scheduled today" — matches the bible's own named example
 * ("customer arriving soon") being distinct from a routine same-day
 * pickup with hours still to go. */
const ARRIVING_SOON_HOURS = 2

function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60)
}

function reservationCards(reservation: MissionReservationInput, nowIso: string): MissionCard[] {
  const cards: MissionCard[] = []

  if (reservation.returnDueToday && !reservation.hasCompletedReturnInspection) {
    const hoursUntilReturn = hoursBetween(nowIso, reservation.returnAt)
    if (hoursUntilReturn < 0) {
      cards.push({
        id: `${reservation.id}-return-overdue`,
        title: `${reservation.reference} is overdue for return`,
        subtitle: `${reservation.customerName}${reservation.vehicleLabel ? ` — ${reservation.vehicleLabel}` : ""}`,
        href: `/reservations/${reservation.id}/return`,
        tone: "critical",
      })
    } else {
      cards.push({
        id: `${reservation.id}-return-due`,
        title: `${reservation.reference} is due back today`,
        subtitle: `${reservation.customerName}${reservation.vehicleLabel ? ` — ${reservation.vehicleLabel}` : ""}`,
        href: `/reservations/${reservation.id}/return`,
        tone: "operational",
      })
    }
  }

  if (reservation.pickupDueToday && !reservation.hasCompletedPickupInspection) {
    const hoursUntilPickup = hoursBetween(nowIso, reservation.pickupAt)
    if (reservation.hasPickupInspection) {
      cards.push({
        id: `${reservation.id}-inspection-waiting`,
        title: `${reservation.reference}'s pickup inspection is waiting to be finished`,
        subtitle: `${reservation.customerName}${reservation.vehicleLabel ? ` — ${reservation.vehicleLabel}` : ""}`,
        href: `/reservations/${reservation.id}/pickup`,
        tone: "operational",
      })
    } else if (hoursUntilPickup >= 0 && hoursUntilPickup <= ARRIVING_SOON_HOURS) {
      cards.push({
        id: `${reservation.id}-pickup-soon`,
        title: `${reservation.customerName} is arriving soon`,
        subtitle: `${reservation.reference}${reservation.vehicleLabel ? ` — ${reservation.vehicleLabel}` : ""}`,
        href: `/reservations/${reservation.id}/pickup`,
        tone: "operational",
      })
    } else {
      cards.push({
        id: `${reservation.id}-pickup-today`,
        title: `${reservation.reference} is scheduled for pickup today`,
        subtitle: `${reservation.customerName}${reservation.vehicleLabel ? ` — ${reservation.vehicleLabel}` : ""}`,
        href: `/reservations/${reservation.id}/pickup`,
        tone: "informational",
      })
    }
  }

  if (reservation.contractAwaitingSignature) {
    cards.push({
      id: `${reservation.id}-contract-ready`,
      title: `${reservation.reference}'s contract is ready to sign`,
      subtitle: reservation.customerName,
      href: `/reservations/${reservation.id}/contract-preview`,
      tone: "operational",
    })
  }

  return cards
}

function maintenanceCards(job: MissionMaintenanceInput): MissionCard[] {
  const title = `${job.type.replace(/_/g, " ")} — ${job.vehicleLabel}`
  const tone: MissionCardTone = job.priority === "urgent" ? "critical" : job.priority === "high" ? "operational" : "informational"
  const subtitle =
    job.status === "in_progress" || job.status === "waiting_for_parts"
      ? "In progress"
      : job.scheduledOn
        ? `Scheduled ${job.scheduledOn}`
        : "Not yet scheduled"

  return [
    {
      id: `maint-${job.id}`,
      title,
      subtitle,
      href: `/maintenance/${job.id}`,
      tone,
    },
  ]
}

const FEED_TONE_BY_TIER: Record<PriorityTier, MissionCardTone> = {
  critical: "critical",
  operational: "operational",
  business_health: "informational",
  informational: "informational",
}

function feedItemCard(item: MissionFeedItemInput): MissionCard {
  return {
    id: `feed-${item.id}`,
    title: item.observation,
    subtitle: item.actionLabel,
    href: item.actionHref,
    tone: FEED_TONE_BY_TIER[item.priorityTier],
  }
}

/** Combines today's relevant reservations and the phase-12 operations
 * feed's own already-reasoned items into one ordered list of actionable
 * cards — critical first, then operational, then informational; stable
 * within a tone (reservation cards before feed cards, insertion order
 * otherwise), never re-sorted by anything as volatile as detection
 * time within a tier the way the desktop feed is. */
export function buildMissionFeed(input: {
  reservations: MissionReservationInput[]
  feedItems: MissionFeedItemInput[]
  maintenanceJobs?: MissionMaintenanceInput[]
  nowIso: string
}): MissionCard[] {
  const cards: MissionCard[] = []
  for (const reservation of input.reservations) {
    cards.push(...reservationCards(reservation, input.nowIso))
  }
  for (const job of input.maintenanceJobs ?? []) {
    cards.push(...maintenanceCards(job))
  }
  for (const item of input.feedItems) {
    cards.push(feedItemCard(item))
  }

  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => TONE_ORDER[a.card.tone] - TONE_ORDER[b.card.tone] || a.index - b.index)
    .map(({ card }) => card)
}
