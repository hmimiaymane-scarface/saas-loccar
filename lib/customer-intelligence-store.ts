import { createClient } from "@/lib/supabase/server"
import {
  computeTrustScore,
  computeCustomerLifetimeValue,
  type TrustScoreResult,
  type TrustScoreInput,
  type CustomerLifetimeValueResult,
  type CustomerLifetimeValueInput,
} from "@/lib/customer-intelligence"
import { generateCustomerSummary } from "@/lib/customer-summary"
import type { SessionContext } from "@/lib/auth/session"
import type { BookingStatus, VehicleCategory } from "@/types/rental"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * The database-facing half of roadmap phase 08 — gathers one
 * customer's real history, runs it through the pure functions in
 * lib/customer-intelligence.ts, generates a summary, and caches the
 * result in `customer_intelligence` (requirement 6: computed
 * server-side, cached, recomputed on relevant events rather than every
 * page load — see the wiring in
 * app/(dashboard)/{reservations,payments,damages}/actions.ts).
 */

export interface CustomerIntelligenceResult {
  trust: TrustScoreResult
  clv: CustomerLifetimeValueResult
  summary: string | null
  computedReason: string
  computedAt: string
}

const MS_PER_MONTH = 30.44 * 86_400_000

interface RawReservation {
  id: string
  status: BookingStatus
  pickupAt: string
  returnAt: string
  remainingBalanceMad: number
  vehicleCategory: VehicleCategory | null
}

async function gatherCustomerRawData(
  supabase: SupabaseServerClient,
  companyId: string,
  customerId: string,
  now: Date = new Date()
): Promise<{ customerLabel: string; trustInput: TrustScoreInput; clvInput: CustomerLifetimeValueInput } | null> {
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("full_name, created_at")
    .eq("company_id", companyId)
    .eq("id", customerId)
    .maybeSingle()

  if (customerError) throw customerError
  if (!customer) return null

  const [documentsRes, reservationsRes, paymentsRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .eq("status", "active")
      .in("category", ["identity_document", "driving_licence"]),
    supabase
      .from("reservations")
      .select("id, status, pickup_at, return_at, remaining_balance, vehicle:vehicles(category)")
      .eq("company_id", companyId)
      .eq("customer_id", customerId),
    supabase.from("payments").select("transaction_type, amount").eq("company_id", companyId).eq("customer_id", customerId),
  ])

  if (documentsRes.error) throw documentsRes.error
  if (reservationsRes.error) throw reservationsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const hasVerifiedIdentity = (documentsRes.data ?? []).length > 0

  const reservations: RawReservation[] = (reservationsRes.data ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as BookingStatus,
    pickupAt: r.pickup_at as string,
    returnAt: r.return_at as string,
    remainingBalanceMad: Number(r.remaining_balance),
    vehicleCategory: (r.vehicle as unknown as { category: string } | null)?.category as VehicleCategory | null,
  }))

  const completedReservations = reservations.filter((r) => r.status === "completed")
  const countedReservations = reservations.filter((r) => r.status === "completed" || r.status === "active")
  const completedIds = completedReservations.map((r) => r.id)

  const [damagesRes, depositsRes, returnedEventsRes] = await Promise.all([
    completedIds.length > 0
      ? supabase.from("damages").select("pre_existing").eq("company_id", companyId).in("reservation_id", completedIds)
      : Promise.resolve({ data: [], error: null }),
    completedIds.length > 0
      ? supabase.from("deposits").select("status, retained_amount").eq("company_id", companyId).in("reservation_id", completedIds)
      : Promise.resolve({ data: [], error: null }),
    completedIds.length > 0
      ? supabase
          .from("activity_log")
          .select("metadata, created_at")
          .eq("company_id", companyId)
          .eq("type", "vehicle_returned")
          .in("metadata->>reservation_id", completedIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (damagesRes.error) throw damagesRes.error
  if (depositsRes.error) throw depositsRes.error
  if (returnedEventsRes.error) throw returnedEventsRes.error

  const damagesCausedCount = (damagesRes.data ?? []).filter((d) => !d.pre_existing).length
  const depositIssuesCount = (depositsRes.data ?? []).filter(
    (d) => d.status === "disputed" || Number(d.retained_amount) > 0
  ).length

  const returnByReservation = new Map<string, string>()
  for (const row of returnedEventsRes.data ?? []) {
    const reservationId = (row.metadata as { reservation_id?: string } | null)?.reservation_id
    if (reservationId) returnByReservation.set(reservationId, row.created_at as string)
  }
  const lateReturnsCount = completedReservations.filter((r) => {
    const returnedAt = returnByReservation.get(r.id)
    return returnedAt != null && new Date(returnedAt).getTime() > new Date(r.returnAt).getTime()
  }).length

  const netRevenueMad = (paymentsRes.data ?? []).reduce((sum, p) => {
    const amount = Number(p.amount)
    return p.transaction_type === "refund" ? sum - amount : sum + amount
  }, 0)

  const outstandingBalanceIncidentsCount = completedReservations.filter((r) => r.remainingBalanceMad > 0).length

  const categoryCounts = new Map<VehicleCategory, number>()
  for (const r of countedReservations) {
    if (!r.vehicleCategory) continue
    categoryCounts.set(r.vehicleCategory, (categoryCounts.get(r.vehicleCategory) ?? 0) + 1)
  }
  let preferredCategory: VehicleCategory | null = null
  let bestCount = 0
  for (const [category, count] of categoryCounts) {
    if (count > bestCount) {
      preferredCategory = category
      bestCount = count
    }
  }

  const earliestPickupMs =
    reservations.length > 0 ? Math.min(...reservations.map((r) => new Date(r.pickupAt).getTime())) : null
  const tenureStartMs = earliestPickupMs ?? new Date(customer.created_at as string).getTime()
  const tenureMonths = Math.max(0, Math.round(((now.getTime() - tenureStartMs) / MS_PER_MONTH) * 100) / 100)

  return {
    customerLabel: customer.full_name as string,
    trustInput: {
      hasVerifiedIdentity,
      successfulRentalsCount: completedReservations.length,
      lateReturnsCount,
      completedReservationsCount: completedReservations.length,
      damagesCausedCount,
      outstandingBalanceIncidentsCount,
      depositIssuesCount,
    },
    clvInput: {
      lifetimeRevenueMad: Math.round(netRevenueMad * 100) / 100,
      reservationCount: countedReservations.length,
      tenureMonths,
      preferredCategory,
    },
  }
}

/**
 * Gathers this customer's full history, computes trust score/lifetime
 * value, generates a summary (best-effort — a failed or unconfigured
 * AI provider still lets the score computation succeed), and upserts
 * the cache row. Returns null only when the customer itself doesn't
 * exist/isn't in this company.
 */
export async function recomputeCustomerIntelligence(
  supabase: SupabaseServerClient,
  session: SessionContext,
  customerId: string,
  reason: string,
  now: Date = new Date()
): Promise<CustomerIntelligenceResult | null> {
  const gathered = await gatherCustomerRawData(supabase, session.company.id, customerId, now)
  if (!gathered) return null

  const trust = computeTrustScore(gathered.trustInput)
  const clv = computeCustomerLifetimeValue(gathered.clvInput)

  const summaryResult = await generateCustomerSummary(supabase, session, gathered.customerLabel, trust, clv)
  const summary = summaryResult.ok ? summaryResult.data.summary : null

  const computedAt = new Date().toISOString()

  const { error: upsertError } = await supabase.from("customer_intelligence").upsert(
    {
      company_id: session.company.id,
      customer_id: customerId,
      trust_score: trust.score,
      trust_band: trust.band,
      trust_factors: trust.factors,
      lifetime_revenue_mad: clv.lifetimeRevenueMad,
      rental_frequency_per_year: clv.rentalFrequencyPerYear,
      average_reservation_mad: clv.averageReservationMad,
      expected_future_value_mad: clv.expectedFutureValueMad,
      preferred_category: clv.preferredCategory,
      summary,
      computed_reason: reason,
      computed_at: computedAt,
    },
    { onConflict: "company_id,customer_id" }
  )

  if (upsertError) throw upsertError

  return { trust, clv, summary, computedReason: reason, computedAt }
}

/** Best-effort wrapper for the event-triggered call sites — a scoring
 * failure must never fail the real mutation that triggered it, same
 * convention as lib/activity-log.ts#recordEvent and phase 06's
 * recomputeVehicleIntelligenceBestEffort. */
export async function recomputeCustomerIntelligenceBestEffort(
  supabase: SupabaseServerClient,
  session: SessionContext,
  customerId: string,
  reason: string
): Promise<void> {
  try {
    await recomputeCustomerIntelligence(supabase, session, customerId, reason)
  } catch {
    // Best-effort — see doc comment above.
  }
}

/** Reads the cached score, computing it once lazily if this customer
 * has never triggered a recompute yet — same convention as phase 06's
 * getVehicleIntelligence. */
export async function getCustomerIntelligence(
  supabase: SupabaseServerClient,
  session: SessionContext,
  customerId: string
): Promise<CustomerIntelligenceResult | null> {
  const { data, error } = await supabase
    .from("customer_intelligence")
    .select(
      "trust_score, trust_band, trust_factors, lifetime_revenue_mad, rental_frequency_per_year, average_reservation_mad, expected_future_value_mad, preferred_category, summary, computed_reason, computed_at"
    )
    .eq("company_id", session.company.id)
    .eq("customer_id", customerId)
    .maybeSingle()

  if (error) throw error

  if (data) {
    return {
      trust: { score: data.trust_score, band: data.trust_band, factors: data.trust_factors } as TrustScoreResult,
      clv: {
        lifetimeRevenueMad: Number(data.lifetime_revenue_mad),
        rentalFrequencyPerYear: Number(data.rental_frequency_per_year),
        averageReservationMad: Number(data.average_reservation_mad),
        expectedFutureValueMad: Number(data.expected_future_value_mad),
        preferredCategory: data.preferred_category as VehicleCategory | null,
      },
      summary: data.summary,
      computedReason: data.computed_reason,
      computedAt: data.computed_at,
    }
  }

  return recomputeCustomerIntelligence(supabase, session, customerId, "initial_view")
}
