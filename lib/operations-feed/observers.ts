import { formatMad, formatDate } from "@/lib/format"
import { periodsOverlap, BLOCKING_RESERVATION_STATUSES } from "@/lib/availability"
import type { FeedItemDraft } from "@/lib/operations-feed/types"
import {
  IDLE_VEHICLE_THRESHOLD_DAYS,
  IDLE_VEHICLE_CRITICAL_MULTIPLIER,
  STALE_INSPECTION_HOURS,
  REQUIRED_HANDOFF_PHOTO_SLOTS,
  INACTIVE_CUSTOMER_MIN_LIFETIME_REVENUE_MAD,
  PRICING_MIN_CATEGORY_SAMPLE_SIZE,
  PRICING_DEVIATION_THRESHOLD_PERCENT,
} from "@/lib/operations-feed/thresholds"
import type { VehicleCategory, VehicleStatus, InspectionType } from "@/types/rental"

/**
 * Roadmap phase 12's eight observers (requirement 1) — every one a
 * pure function over already-fetched data, no Supabase dependency, so
 * every threshold decision is hand-fixture tested independently of
 * the database. `lib/operations-feed/run.ts` is the DB-facing half
 * that fetches the inputs these expect and calls them.
 *
 * "No output is a valid, good output" (requirement 2) — every
 * function below returns `null` (or `[]`) far more often than it
 * returns a draft, and every threshold is named in
 * `lib/operations-feed/thresholds.ts` specifically so "why didn't
 * this fire" has a real, inspectable answer.
 */

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000
}

// ---------------------------------------------------------------------
// 1. Idle vehicle
// ---------------------------------------------------------------------

export interface IdleVehicleInput {
  vehicleId: string
  make: string
  model: string
  plate: string
  status: VehicleStatus
  lastActivityAt: string
  hasUpcomingReservation: boolean
  now: Date
}

export function evaluateIdleVehicle(input: IdleVehicleInput): FeedItemDraft | null {
  if (input.status !== "available") return null
  if (input.hasUpcomingReservation) return null

  const idleDays = Math.floor(daysBetween(new Date(input.lastActivityAt), input.now))
  if (idleDays < IDLE_VEHICLE_THRESHOLD_DAYS) return null

  const label = `${input.make} ${input.model} (${input.plate})`
  const critical = idleDays >= IDLE_VEHICLE_THRESHOLD_DAYS * IDLE_VEHICLE_CRITICAL_MULTIPLIER

  return {
    observerType: "idle_vehicle",
    entityType: "vehicle",
    entityId: input.vehicleId,
    priorityTier: critical ? "operational" : "business_health",
    observation: `${label} has been idle for ${idleDays} days.`,
    reasoning: `No pickup or return recorded for this vehicle since ${formatDate(input.lastActivityAt)}, and nothing is booked to change that.`,
    suggestedAction: critical ? "Actively look for a booking for this vehicle today." : "Consider a promotion or proactive outreach to book this vehicle.",
    actionLabel: "Open",
    actionHref: `/fleet/${input.vehicleId}`,
    confidence: "high",
  }
}

// ---------------------------------------------------------------------
// 2. Expiring document
// ---------------------------------------------------------------------

export interface ExpiringDocumentInput {
  documentId: string
  categoryLabel: string
  expiresOn: string
  customerId: string | null
  vehicleId: string | null
  now: Date
}

/** Always produces a draft — the caller only invokes this for
 * documents `getExpiringDocuments` already decided are within the
 * warning window, so "should this fire at all" was already answered
 * upstream by the company's own `document_expiry_warning_days`
 * setting. This function's only job is priority + wording. */
export function evaluateExpiringDocument(input: ExpiringDocumentInput): FeedItemDraft {
  const daysLeft = Math.ceil(daysBetween(input.now, new Date(input.expiresOn)))
  const expired = daysLeft < 0
  const entityType = input.customerId ? "customer" : "document"
  const entityId = input.customerId ?? input.documentId
  const actionHref = input.customerId ? `/customers/${input.customerId}` : input.vehicleId ? `/fleet/${input.vehicleId}` : `/documents`

  return {
    observerType: "expiring_document",
    entityType,
    entityId,
    priorityTier: expired || daysLeft <= 3 ? "critical" : "operational",
    observation: expired
      ? `${input.categoryLabel} expired ${formatDate(input.expiresOn)}.`
      : `${input.categoryLabel} expires ${formatDate(input.expiresOn)} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).`,
    reasoning: expired
      ? "This document is past its expiry date and should be renewed before it's relied on again."
      : "Renewing ahead of the expiry date avoids a gap where this document can't be used.",
    suggestedAction: "Upload a renewed document.",
    actionLabel: "Open",
    actionHref,
    confidence: "high",
  }
}

// ---------------------------------------------------------------------
// 3. Overlapping reservations
// ---------------------------------------------------------------------

export interface ReservationWindow {
  id: string
  reference: string
  status: string
  pickupAt: string
  returnAt: string
}

/** Belt-and-suspenders: the database's own EXCLUDE constraint
 * (`reservations_no_overlap`) should prevent this at insertion time
 * in live mode — this observer exists to catch anything that slips
 * past it anyway (mock-mode data, a historical import, a status
 * transition that re-activates a reservation without re-checking).
 * Reuses `lib/availability.ts#periodsOverlap`, the same pure interval
 * check the booking flow itself already trusts, rather than a second
 * overlap definition. */
export function evaluateOverlappingReservations(vehicleId: string, reservations: ReservationWindow[]): FeedItemDraft[] {
  const blocking = reservations
    .filter((r) => BLOCKING_RESERVATION_STATUSES.includes(r.status as (typeof BLOCKING_RESERVATION_STATUSES)[number]))
    .sort((a, b) => new Date(a.pickupAt).getTime() - new Date(b.pickupAt).getTime())

  const drafts: FeedItemDraft[] = []
  for (let i = 0; i < blocking.length; i++) {
    for (let j = i + 1; j < blocking.length; j++) {
      const a = blocking[i]
      const b = blocking[j]
      if (!periodsOverlap(a.pickupAt, a.returnAt, b.pickupAt, b.returnAt)) continue
      // The later-pickup reservation is the one that "introduced" the
      // conflict against an already-existing booking.
      drafts.push({
        observerType: "overlapping_reservations",
        entityType: "reservation",
        entityId: b.id,
        priorityTier: "critical",
        observation: `${b.reference} overlaps with ${a.reference} for the same vehicle.`,
        reasoning: `Both reservations request this vehicle for overlapping dates (${formatDate(a.pickupAt)}–${formatDate(a.returnAt)} and ${formatDate(b.pickupAt)}–${formatDate(b.returnAt)}) — only one can actually happen as booked.`,
        suggestedAction: "Reassign one reservation to a different vehicle or adjust its dates.",
        actionLabel: "Review",
        actionHref: `/reservations/${b.id}`,
        confidence: "high",
      })
    }
  }
  return drafts
}

// ---------------------------------------------------------------------
// 4. Unusual pricing (candidate detection — pure statistics only; the
//    AI judgment call on top of these candidates lives in run.ts,
//    per requirement 8's cost discipline: one batched call per
//    company, never one call per reservation).
// ---------------------------------------------------------------------

export interface PricingDataPoint {
  reservationId: string
  reference: string
  dailyRateMad: number
  category: VehicleCategory
}

export interface PricingOutlier {
  point: PricingDataPoint
  categoryMeanMad: number
  deviationPercent: number
}

export function findPricingOutliers(points: PricingDataPoint[]): PricingOutlier[] {
  const byCategory = new Map<VehicleCategory, PricingDataPoint[]>()
  for (const p of points) {
    const list = byCategory.get(p.category) ?? []
    list.push(p)
    byCategory.set(p.category, list)
  }

  const outliers: PricingOutlier[] = []
  for (const [, categoryPoints] of byCategory) {
    if (categoryPoints.length < PRICING_MIN_CATEGORY_SAMPLE_SIZE) continue
    const mean = categoryPoints.reduce((sum, p) => sum + p.dailyRateMad, 0) / categoryPoints.length
    if (mean <= 0) continue
    for (const p of categoryPoints) {
      const deviationPercent = (Math.abs(p.dailyRateMad - mean) / mean) * 100
      if (deviationPercent >= PRICING_DEVIATION_THRESHOLD_PERCENT) {
        outliers.push({ point: p, categoryMeanMad: Math.round(mean), deviationPercent: Math.round(deviationPercent) })
      }
    }
  }
  return outliers
}

/** Turns one AI-confirmed outlier into a feed item — called by
 * `run.ts` only for the subset the AI review actually flagged as
 * worth surfacing, with the reasoning it generated (never fabricated
 * deterministically, since "is this discount legitimate" is a
 * judgment call, not a fact this function could know on its own). */
export function draftUnusualPricingItem(outlier: PricingOutlier, aiReasoning: string, aiConfidence: "high" | "medium" | "low"): FeedItemDraft {
  const direction = outlier.point.dailyRateMad < outlier.categoryMeanMad ? "below" : "above"
  return {
    observerType: "unusual_pricing",
    entityType: "reservation",
    entityId: outlier.point.reservationId,
    priorityTier: "business_health",
    observation: `${outlier.point.reference}'s daily rate (${formatMad(outlier.point.dailyRateMad)}) is ${outlier.deviationPercent}% ${direction} the ${outlier.point.category} average (${formatMad(outlier.categoryMeanMad)}).`,
    reasoning: aiReasoning,
    suggestedAction: "Review this reservation's pricing.",
    actionLabel: "Review",
    actionHref: `/reservations/${outlier.point.reservationId}`,
    confidence: aiConfidence,
  }
}

// ---------------------------------------------------------------------
// 5. Inactive, high-value customer
// ---------------------------------------------------------------------

export interface InactiveCustomerInput {
  customerId: string
  fullName: string
  phone: string
  lifetimeRevenueMad: number
}

export function evaluateInactiveHighValueCustomer(input: InactiveCustomerInput): FeedItemDraft | null {
  if (input.lifetimeRevenueMad < INACTIVE_CUSTOMER_MIN_LIFETIME_REVENUE_MAD) return null

  return {
    observerType: "inactive_high_value_customer",
    entityType: "customer",
    entityId: input.customerId,
    priorityTier: "business_health",
    observation: `${input.fullName} hasn't rented in a while, despite ${formatMad(input.lifetimeRevenueMad)} in lifetime revenue.`,
    reasoning: "A previously valuable customer going quiet is worth a personal check-in before they're gone for good.",
    suggestedAction: `Call ${input.fullName} to reconnect.`,
    actionLabel: "Call",
    actionHref: `tel:${input.phone.replace(/[^+\d]/g, "")}`,
    confidence: "high",
  }
}

// ---------------------------------------------------------------------
// 6. Vehicle health/profitability decline
// ---------------------------------------------------------------------

export interface VehicleHealthInput {
  vehicleId: string
  make: string
  model: string
  plate: string
  healthScore: number
  healthBand: "excellent" | "good" | "fair" | "poor"
  profitabilityNetMad: number
}

/** "Declining" per the bible's phrasing implies a trend — this
 * codebase has no historical snapshots of vehicle_intelligence to
 * compute one from (it's upserted, not appended). Flags the current
 * poor-health/negative-profitability state instead, which is the
 * more urgent and honestly-supportable version of the same underlying
 * concern; a future phase could add real trend detection if a
 * snapshot history is built. See docs/operations-feed.md. */
export function evaluateVehicleHealthDecline(input: VehicleHealthInput): FeedItemDraft | null {
  const unhealthy = input.healthBand === "poor"
  const unprofitable = input.profitabilityNetMad < 0
  if (!unhealthy && !unprofitable) return null

  const label = `${input.make} ${input.model} (${input.plate})`
  const reasons = [unhealthy ? `health score ${input.healthScore}/100 ("poor")` : null, unprofitable ? `negative net profitability (${formatMad(input.profitabilityNetMad)})` : null]
    .filter(Boolean)
    .join(" and ")

  return {
    observerType: "vehicle_health_decline",
    entityType: "vehicle",
    entityId: input.vehicleId,
    priorityTier: input.healthScore < 20 ? "operational" : "business_health",
    observation: `${label} needs attention: ${reasons}.`,
    reasoning: "This vehicle's recorded history (damages, maintenance, utilization, revenue) points to it costing more than it's earning right now.",
    suggestedAction: "Review its maintenance history and consider whether it needs service, repricing, or retirement from the fleet.",
    actionLabel: "Open",
    actionHref: `/fleet/${input.vehicleId}`,
    confidence: "high",
  }
}

// ---------------------------------------------------------------------
// 7. Stale (unfinished) inspection
// ---------------------------------------------------------------------

export interface StaleInspectionInput {
  inspectionId: string
  reservationId: string
  reservationReference: string
  type: InspectionType
  createdAt: string
  now: Date
}

export function evaluateStaleInspection(input: StaleInspectionInput): FeedItemDraft | null {
  const hoursOpen = (input.now.getTime() - new Date(input.createdAt).getTime()) / 3_600_000
  if (hoursOpen < STALE_INSPECTION_HOURS) return null

  const workflowPath = input.type === "pickup" ? "pickup" : "return"
  return {
    observerType: "stale_inspection",
    entityType: "inspection",
    entityId: input.inspectionId,
    priorityTier: "operational",
    observation: `${input.reservationReference}'s ${input.type} inspection was started but never finished.`,
    reasoning: `It's been open for over ${Math.floor(hoursOpen)} hours with no completion — the handoff is stuck mid-process.`,
    suggestedAction: "Resume and finish the inspection.",
    actionLabel: "Resume",
    actionHref: `/reservations/${input.reservationId}/${workflowPath}`,
    confidence: "high",
  }
}

// ---------------------------------------------------------------------
// 8. Missing handoff photos
// ---------------------------------------------------------------------

export interface MissingHandoffPhotosInput {
  inspectionId: string
  reservationId: string
  reservationReference: string
  type: InspectionType
  capturedSlots: string[]
}

export function evaluateMissingHandoffPhotos(input: MissingHandoffPhotosInput): FeedItemDraft | null {
  const missing = REQUIRED_HANDOFF_PHOTO_SLOTS.filter((slot) => !input.capturedSlots.includes(slot))
  if (missing.length === 0) return null

  const labels: Record<string, string> = { fuel_gauge: "fuel level", dashboard_odometer: "odometer" }
  const missingLabels = missing.map((s) => labels[s] ?? s).join(" and ")

  return {
    observerType: "missing_handoff_photos",
    entityType: "inspection",
    entityId: input.inspectionId,
    priorityTier: "operational",
    observation: `${input.reservationReference}'s ${input.type} inspection is missing a ${missingLabels} photo.`,
    reasoning: "Without this, there's no record to fall back on if the fuel level or mileage is ever disputed.",
    suggestedAction: `Add the missing ${missingLabels} photo.`,
    actionLabel: "Open",
    actionHref: `/reservations/${input.reservationId}`,
    confidence: "high",
  }
}
