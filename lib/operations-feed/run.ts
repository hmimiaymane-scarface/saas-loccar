import { createClient } from "@/lib/supabase/server"
import { getExpiringDocuments } from "@/lib/documents"
import { CATEGORY_OPTIONS } from "@/lib/document-categories"
import { getInactiveCustomers } from "@/lib/customer-segments"
import {
  evaluateIdleVehicle,
  evaluateExpiringDocument,
  evaluateOverlappingReservations,
  findPricingOutliers,
  draftUnusualPricingItem,
  evaluateInactiveHighValueCustomer,
  evaluateVehicleHealthDecline,
  evaluateStaleInspection,
  evaluateMissingHandoffPhotos,
  type PricingDataPoint,
  type ReservationWindow,
} from "@/lib/operations-feed/observers"
import { reviewPricingOutliers, type PricingReviewContext } from "@/lib/operations-feed/pricing-ai"
import { INACTIVE_CUSTOMER_MONTHS } from "@/lib/operations-feed/thresholds"
import { upsertOperationsFeedItem } from "@/lib/operations-feed/upsert"
import type { FeedItemDraft } from "@/lib/operations-feed/types"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Roadmap phase 12's orchestrator — the DB-facing half of the eight
 * pure observers in `observers.ts`. One call per company (the cron
 * route, `app/api/cron/operations-feed/route.ts`, loops over every
 * company using the admin client from `lib/supabase/admin.ts`; a
 * regular request-scoped client also works here for the manual
 * "run now" dev action, since either satisfies the same
 * `SupabaseServerClient` shape).
 */

const CATEGORY_LABEL = new Map(CATEGORY_OPTIONS.map((c) => [c.value, c.label]))

interface ReservationRow {
  id: string
  reference: string
  status: string
  pickup_at: string
  return_at: string
  daily_rate: string | number
  vehicle_id: string | null
  customer_id: string
  vehicle: { category: string } | null
}

async function gatherIdleVehicleDrafts(supabase: SupabaseServerClient, companyId: string, reservations: ReservationRow[], now: Date): Promise<FeedItemDraft[]> {
  const { data: vehicles, error } = await supabase.from("vehicles").select("id, make, model, registration_number, status, created_at").eq("company_id", companyId)
  if (error) throw error

  const lastActivityByVehicle = new Map<string, string>()
  const hasUpcomingByVehicle = new Set<string>()
  for (const r of reservations) {
    if (!r.vehicle_id) continue
    if (r.status === "completed") {
      const current = lastActivityByVehicle.get(r.vehicle_id)
      if (!current || new Date(r.return_at) > new Date(current)) lastActivityByVehicle.set(r.vehicle_id, r.return_at)
    }
    if (["pending", "confirmed", "active"].includes(r.status) && new Date(r.pickup_at) > now) {
      hasUpcomingByVehicle.add(r.vehicle_id)
    }
  }

  const drafts: FeedItemDraft[] = []
  for (const v of vehicles ?? []) {
    const draft = evaluateIdleVehicle({
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      plate: v.registration_number,
      status: v.status as never,
      lastActivityAt: lastActivityByVehicle.get(v.id) ?? (v.created_at as string),
      hasUpcomingReservation: hasUpcomingByVehicle.has(v.id),
      now,
    })
    if (draft) drafts.push(draft)
  }
  return drafts
}

async function gatherExpiringDocumentDrafts(supabase: SupabaseServerClient, companyId: string, now: Date): Promise<FeedItemDraft[]> {
  const { data: company, error } = await supabase.from("companies").select("document_expiry_warning_days").eq("id", companyId).single()
  if (error) throw error

  const documents = await getExpiringDocuments(supabase, companyId, company.document_expiry_warning_days, now)
  return documents.map((doc) =>
    evaluateExpiringDocument({
      documentId: doc.id,
      categoryLabel: CATEGORY_LABEL.get(doc.category) ?? doc.category,
      expiresOn: doc.expiresOn,
      customerId: doc.customerId,
      vehicleId: doc.vehicleId,
      now,
    })
  )
}

function gatherOverlapDrafts(reservations: ReservationRow[]): FeedItemDraft[] {
  const byVehicle = new Map<string, ReservationWindow[]>()
  for (const r of reservations) {
    if (!r.vehicle_id) continue
    const list = byVehicle.get(r.vehicle_id) ?? []
    list.push({ id: r.id, reference: r.reference, status: r.status, pickupAt: r.pickup_at, returnAt: r.return_at })
    byVehicle.set(r.vehicle_id, list)
  }
  const drafts: FeedItemDraft[] = []
  for (const [vehicleId, windows] of byVehicle) {
    drafts.push(...evaluateOverlappingReservations(vehicleId, windows))
  }
  return drafts
}

async function gatherPricingDrafts(supabase: SupabaseServerClient, companyId: string, reservations: ReservationRow[]): Promise<FeedItemDraft[]> {
  const points: PricingDataPoint[] = reservations
    .filter((r) => r.vehicle?.category && ["request", "pending", "confirmed", "active", "completed"].includes(r.status))
    .map((r) => ({ reservationId: r.id, reference: r.reference, dailyRateMad: Number(r.daily_rate), category: r.vehicle!.category as never }))

  const outliers = findPricingOutliers(points)
  if (outliers.length === 0) return []

  const customerIds = [...new Set(outliers.map((o) => reservations.find((r) => r.id === o.point.reservationId)?.customer_id).filter((id): id is string => Boolean(id)))]
  const [{ data: customers }, { data: history }] = await Promise.all([
    supabase.from("customers").select("id, full_name").eq("company_id", companyId).in("id", customerIds),
    supabase.from("reservations").select("customer_id, status").eq("company_id", companyId).in("customer_id", customerIds).in("status", ["active", "completed"]),
  ])
  const nameById = new Map((customers ?? []).map((c) => [c.id, c.full_name as string]))
  const countByCustomer = new Map<string, number>()
  for (const h of history ?? []) countByCustomer.set(h.customer_id as string, (countByCustomer.get(h.customer_id as string) ?? 0) + 1)

  const context = new Map<string, PricingReviewContext>()
  for (const o of outliers) {
    const reservation = reservations.find((r) => r.id === o.point.reservationId)
    if (!reservation) continue
    const priorRentals = countByCustomer.get(reservation.customer_id) ?? 0
    context.set(o.point.reservationId, {
      reservationId: o.point.reservationId,
      customerLabel: nameById.get(reservation.customer_id) ?? "Unknown",
      customerNote: priorRentals > 0 ? `repeat customer, ${priorRentals} prior rental${priorRentals === 1 ? "" : "s"}` : "first-time customer",
    })
  }

  const review = await reviewPricingOutliers(supabase, companyId, outliers, context)
  if (!review.ok) return [] // best-effort — a review failure just means this observer sits out this run, not a hard failure

  const drafts: FeedItemDraft[] = []
  for (const outlier of outliers) {
    const verdict = review.data.reviews.find((r) => r.reservationId === outlier.point.reservationId)
    if (!verdict?.worthFlagging) continue
    drafts.push(draftUnusualPricingItem(outlier, verdict.reasoning, verdict.confidence))
  }
  return drafts
}

async function gatherInactiveCustomerDrafts(supabase: SupabaseServerClient, companyId: string, now: Date): Promise<FeedItemDraft[]> {
  const inactive = await getInactiveCustomers(supabase, companyId, INACTIVE_CUSTOMER_MONTHS, now)
  if (inactive.length === 0) return []

  const { data: intelligence } = await supabase
    .from("customer_intelligence")
    .select("customer_id, lifetime_revenue_mad")
    .eq("company_id", companyId)
    .in(
      "customer_id",
      inactive.map((c) => c.customerId)
    )
  const revenueById = new Map((intelligence ?? []).map((row) => [row.customer_id as string, Number(row.lifetime_revenue_mad)]))

  const drafts: FeedItemDraft[] = []
  for (const customer of inactive) {
    const draft = evaluateInactiveHighValueCustomer({
      customerId: customer.customerId,
      fullName: customer.fullName,
      phone: customer.phone,
      lifetimeRevenueMad: revenueById.get(customer.customerId) ?? 0,
    })
    if (draft) drafts.push(draft)
  }
  return drafts
}

async function gatherVehicleHealthDrafts(supabase: SupabaseServerClient, companyId: string): Promise<FeedItemDraft[]> {
  const { data, error } = await supabase
    .from("vehicle_intelligence")
    .select("vehicle_id, health_score, health_band, profitability_net_mad, vehicle:vehicles(make, model, registration_number)")
    .eq("company_id", companyId)
  if (error) throw error

  const drafts: FeedItemDraft[] = []
  for (const row of data ?? []) {
    const vehicle = row.vehicle as unknown as { make: string; model: string; registration_number: string } | null
    if (!vehicle) continue
    const draft = evaluateVehicleHealthDecline({
      vehicleId: row.vehicle_id as string,
      make: vehicle.make,
      model: vehicle.model,
      plate: vehicle.registration_number,
      healthScore: row.health_score as number,
      healthBand: row.health_band as never,
      profitabilityNetMad: Number(row.profitability_net_mad),
    })
    if (draft) drafts.push(draft)
  }
  return drafts
}

/** Roadmap phase 34 — `evaluateMissingHandoffPhotos` used to run against
 * `completed` inspections, but `complete_inspection()`'s own hard
 * photo-completeness gate (added in a later migration than this
 * observer) already guarantees both required handoff photos exist
 * before an inspection can reach `completed` — meaning the check could
 * never actually fire there. The condition is still real, just on
 * still-in-progress (`draft`) inspections instead — which is also the
 * only status a real-time trigger (`lib/operations-feed/realtime.ts`)
 * can usefully catch, since it fires from a photo upload that happens
 * before completion. Only `draft` status is fetched now — `evaluateStaleInspection`
 * and `evaluateMissingHandoffPhotos` both run against the same rows. */
async function gatherInspectionDrafts(supabase: SupabaseServerClient, companyId: string, now: Date): Promise<FeedItemDraft[]> {
  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("id, reservation_id, type, status, created_at, reservation:reservations(reference)")
    .eq("company_id", companyId)
    .eq("status", "draft")
  if (error) throw error

  const drafts: FeedItemDraft[] = []
  const inProgressIds: string[] = []
  const inProgressById = new Map<string, { reservationId: string; reference: string; type: string }>()

  for (const insp of inspections ?? []) {
    const reservation = insp.reservation as unknown as { reference: string } | null
    if (!reservation) continue

    const staleDraft = evaluateStaleInspection({
      inspectionId: insp.id,
      reservationId: insp.reservation_id,
      reservationReference: reservation.reference,
      type: insp.type as never,
      createdAt: insp.created_at,
      now,
    })
    if (staleDraft) drafts.push(staleDraft)

    inProgressIds.push(insp.id)
    inProgressById.set(insp.id, { reservationId: insp.reservation_id, reference: reservation.reference, type: insp.type as string })
  }

  if (inProgressIds.length > 0) {
    const { data: media } = await supabase.from("media").select("entity_id, caption").eq("company_id", companyId).eq("entity_type", "inspection").in("entity_id", inProgressIds)
    const slotsByInspection = new Map<string, string[]>()
    for (const m of media ?? []) {
      const list = slotsByInspection.get(m.entity_id as string) ?? []
      if (m.caption) list.push(m.caption as string)
      slotsByInspection.set(m.entity_id as string, list)
    }
    for (const [inspectionId, info] of inProgressById) {
      const photosDraft = evaluateMissingHandoffPhotos({
        inspectionId,
        reservationId: info.reservationId,
        reservationReference: info.reference,
        type: info.type as never,
        capturedSlots: slotsByInspection.get(inspectionId) ?? [],
      })
      if (photosDraft) drafts.push(photosDraft)
    }
  }

  return drafts
}

export interface OperationsFeedRunSummary {
  companyId: string
  detected: number
  opened: number
  updated: number
  resolved: number
}

/** Runs every observer for one company and reconciles the results
 * against `operations_feed_items` (requirement 6): a fresh draft with
 * no existing row becomes a new `open` item; a draft matching an
 * existing `open` row refreshes its content and `last_seen_at`; a
 * draft matching an existing `dismissed` row is left completely
 * untouched (the human's call stands); any existing `open` OR
 * `dismissed` row whose key ISN'T in this run's draft set gets marked
 * `resolved` — the underlying condition no longer holds. */
export async function runOperationsFeedForCompany(supabase: SupabaseServerClient, companyId: string, now: Date = new Date()): Promise<OperationsFeedRunSummary> {
  const { data: reservationRows, error: reservationError } = await supabase
    .from("reservations")
    .select("id, reference, status, pickup_at, return_at, daily_rate, vehicle_id, customer_id, vehicle:vehicles(category)")
    .eq("company_id", companyId)
  if (reservationError) throw reservationError
  const reservations = (reservationRows ?? []) as unknown as ReservationRow[]

  const [idle, expiringDocs, overlaps, pricing, inactiveCustomers, vehicleHealth, inspections] = await Promise.all([
    gatherIdleVehicleDrafts(supabase, companyId, reservations, now),
    gatherExpiringDocumentDrafts(supabase, companyId, now),
    Promise.resolve(gatherOverlapDrafts(reservations)),
    gatherPricingDrafts(supabase, companyId, reservations),
    gatherInactiveCustomerDrafts(supabase, companyId, now),
    gatherVehicleHealthDrafts(supabase, companyId),
    gatherInspectionDrafts(supabase, companyId, now),
  ])

  const drafts = [...idle, ...expiringDocs, ...overlaps, ...pricing, ...inactiveCustomers, ...vehicleHealth, ...inspections]

  const { data: existingRows, error: existingError } = await supabase
    .from("operations_feed_items")
    .select("id, observer_type, entity_type, entity_id, status")
    .eq("company_id", companyId)
    .in("status", ["open", "dismissed"])
  if (existingError) throw existingError

  const existingByKey = new Map((existingRows ?? []).map((r) => [`${r.observer_type}:${r.entity_type}:${r.entity_id}`, r]))
  const draftKeys = new Set(drafts.map((d) => `${d.observerType}:${d.entityType}:${d.entityId}`))

  let opened = 0
  let updated = 0
  let resolved = 0

  // Roadmap phase 34 — the actual insert/update/leave-dismissed decision
  // now lives in upsertOperationsFeedItem(), shared with the real-time
  // trigger in lib/operations-feed/realtime.ts, so the two paths can
  // never quietly disagree about what "open"/"dismissed" means. This
  // loop still supplies `existing` from the one bulk fetch above rather
  // than a query per draft — same cost as before this refactor.
  for (const draft of drafts) {
    const key = { observerType: draft.observerType, entityType: draft.entityType, entityId: draft.entityId }
    const existing = existingByKey.get(`${key.observerType}:${key.entityType}:${key.entityId}`)
    const action = await upsertOperationsFeedItem(supabase, companyId, key, draft, existing, now)
    if (action === "opened") opened++
    else if (action === "updated") updated++
  }

  const toResolve = (existingRows ?? []).filter((r) => !draftKeys.has(`${r.observer_type}:${r.entity_type}:${r.entity_id}`))
  if (toResolve.length > 0) {
    const { error } = await supabase
      .from("operations_feed_items")
      .update({ status: "resolved", resolved_at: now.toISOString() })
      .in(
        "id",
        toResolve.map((r) => r.id)
      )
    if (error) throw error
    resolved = toResolve.length
  }

  return { companyId, detected: drafts.length, opened, updated, resolved }
}
