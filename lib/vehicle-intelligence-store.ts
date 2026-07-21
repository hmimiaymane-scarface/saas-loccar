import { createClient } from "@/lib/supabase/server"
import {
  buildVehicleIntelligenceInputs,
  computeVehicleHealth,
  computeVehicleProfitability,
  computeVehicleUtilization,
  type VehicleRawData,
  type VehicleHealthResult,
  type VehicleProfitabilityResult,
  type VehicleUtilizationResult,
} from "@/lib/vehicle-intelligence"
import { generateVehicleRecommendations, type VehicleRecommendation } from "@/lib/vehicle-recommendations"
import type { AskAiConfidence } from "@/lib/ai/service"
import type { SessionContext } from "@/lib/auth/session"
import type { ExpenseCategory } from "@/types/rental"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * The database-facing half of roadmap phase 06 — gathers one vehicle's
 * raw history, runs it through the pure functions in
 * lib/vehicle-intelligence.ts, generates recommendations, and caches
 * the result in `vehicle_intelligence` (requirement 5: computed
 * server-side, cached, recomputed on relevant events rather than every
 * page load — see the three call sites in
 * app/(dashboard)/{reservations,maintenance,damages}/actions.ts).
 */

export interface VehicleIntelligenceResult {
  health: VehicleHealthResult
  profitability: VehicleProfitabilityResult
  utilization: VehicleUtilizationResult
  recommendations: VehicleRecommendation[] | null
  recommendationsConfidence: AskAiConfidence | null
  computedReason: string
  computedAt: string
}

async function gatherVehicleRawData(
  supabase: SupabaseServerClient,
  companyId: string,
  vehicleId: string
): Promise<{ vehicleLabel: string; raw: VehicleRawData } | null> {
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select(
      "make, model, registration_number, year, odometer_km, daily_rate, acquired_on, insurance_expires_on, registration_expires_on, inspection_expires_on"
    )
    .eq("company_id", companyId)
    .eq("id", vehicleId)
    .maybeSingle()

  if (vehicleError) throw vehicleError
  if (!vehicle) return null

  const [maintenanceRes, damagesRes, inspectionsRes, reservationsRes, expensesRes, paymentsRes] = await Promise.all([
    supabase.from("maintenance_records").select("status, scheduled_on").eq("company_id", companyId).eq("vehicle_id", vehicleId),
    supabase
      .from("damages")
      .select("status, severity, pre_existing, actual_cost, estimated_cost")
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId),
    supabase
      .from("inspections")
      .select("overall_condition, cleanliness")
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("reservations")
      .select("pickup_at, return_at")
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      .in("status", ["active", "completed"]),
    supabase.from("expenses").select("category, amount").eq("company_id", companyId).eq("vehicle_id", vehicleId),
    // Same definition as lib/data.ts#getFleetPerformanceReport's
    // recordedRevenueMad — rental_payment transactions joined through
    // to this vehicle via their reservation.
    supabase
      .from("payments")
      .select("amount, reservation:reservations!inner(vehicle_id)")
      .eq("company_id", companyId)
      .eq("transaction_type", "rental_payment")
      .eq("reservation.vehicle_id", vehicleId),
  ])

  if (maintenanceRes.error) throw maintenanceRes.error
  if (damagesRes.error) throw damagesRes.error
  if (inspectionsRes.error) throw inspectionsRes.error
  if (reservationsRes.error) throw reservationsRes.error
  if (expensesRes.error) throw expensesRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const expensesByCategory: Partial<Record<ExpenseCategory, number>> = {}
  for (const e of expensesRes.data ?? []) {
    const category = e.category as ExpenseCategory
    expensesByCategory[category] = (expensesByCategory[category] ?? 0) + Number(e.amount)
  }

  const rentalIncomeMad = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0)

  const raw: VehicleRawData = {
    year: vehicle.year,
    odometerKm: vehicle.odometer_km,
    dailyRateMad: Number(vehicle.daily_rate),
    acquiredOn: vehicle.acquired_on,
    insuranceExpiresOn: vehicle.insurance_expires_on,
    registrationExpiresOn: vehicle.registration_expires_on,
    inspectionExpiresOn: vehicle.inspection_expires_on,
    maintenanceRecords: (maintenanceRes.data ?? []).map((r) => ({
      status: r.status as VehicleRawData["maintenanceRecords"][number]["status"],
      scheduledOn: r.scheduled_on,
    })),
    damages: (damagesRes.data ?? []).map((d) => ({
      status: d.status as VehicleRawData["damages"][number]["status"],
      severity: d.severity as VehicleRawData["damages"][number]["severity"],
      preExisting: d.pre_existing,
      actualCostMad: d.actual_cost != null ? Number(d.actual_cost) : null,
      estimatedCostMad: d.estimated_cost != null ? Number(d.estimated_cost) : null,
    })),
    inspections: (inspectionsRes.data ?? []).map((i) => ({
      overallCondition: i.overall_condition as VehicleRawData["inspections"][number]["overallCondition"],
      cleanliness: i.cleanliness as VehicleRawData["inspections"][number]["cleanliness"],
    })),
    countedReservations: (reservationsRes.data ?? []).map((r) => ({ pickupAt: r.pickup_at, returnAt: r.return_at })),
    rentalIncomeMad,
    expensesByCategory,
  }

  return { vehicleLabel: `${vehicle.make} ${vehicle.model} (${vehicle.registration_number})`, raw }
}

/**
 * Gathers this vehicle's full history, computes health/profitability/
 * utilization, generates recommendations (best-effort — a failed or
 * unconfigured AI provider still lets the score computation succeed;
 * see generateVehicleRecommendations), and upserts the cache row.
 * Returns null only when the vehicle itself doesn't exist/isn't in this
 * company.
 */
export async function recomputeVehicleIntelligence(
  supabase: SupabaseServerClient,
  session: SessionContext,
  vehicleId: string,
  reason: string
): Promise<VehicleIntelligenceResult | null> {
  const gathered = await gatherVehicleRawData(supabase, session.company.id, vehicleId)
  if (!gathered) return null

  const inputs = buildVehicleIntelligenceInputs(gathered.raw)
  const health = computeVehicleHealth(inputs.health)
  const profitability = computeVehicleProfitability(inputs.profitability)
  const utilization = computeVehicleUtilization(inputs.utilization)

  const recommendationResult = await generateVehicleRecommendations(
    supabase,
    session,
    gathered.vehicleLabel,
    health,
    profitability,
    utilization
  )
  const recommendations = recommendationResult.ok ? recommendationResult.data.recommendations : null
  const recommendationsConfidence = recommendationResult.ok ? recommendationResult.confidence : null

  const computedAt = new Date().toISOString()

  const { error: upsertError } = await supabase.from("vehicle_intelligence").upsert(
    {
      company_id: session.company.id,
      vehicle_id: vehicleId,
      health_score: health.score,
      health_band: health.band,
      health_factors: health.factors,
      profitability_net_mad: profitability.netMad,
      profitability_breakdown: profitability.breakdown,
      utilization,
      recommendations,
      recommendations_confidence: recommendationsConfidence,
      computed_reason: reason,
      computed_at: computedAt,
    },
    { onConflict: "company_id,vehicle_id" }
  )

  if (upsertError) throw upsertError

  return { health, profitability, utilization, recommendations, recommendationsConfidence, computedReason: reason, computedAt }
}

/** Best-effort wrapper for the event-triggered call sites — a scoring
 * failure (e.g. no AI provider configured, a transient DB error) must
 * never fail the real mutation that triggered it, same convention as
 * lib/activity-log.ts#recordEvent. */
export async function recomputeVehicleIntelligenceBestEffort(
  supabase: SupabaseServerClient,
  session: SessionContext,
  vehicleId: string,
  reason: string
): Promise<void> {
  try {
    await recomputeVehicleIntelligence(supabase, session, vehicleId, reason)
  } catch {
    // Best-effort — see doc comment above.
  }
}

/** Reads the cached score. Computes it once, lazily, if this vehicle
 * has never triggered a recompute yet (a brand-new vehicle with no
 * history) — so the vehicle detail page always has something real to
 * show rather than an empty state, without recomputing on every
 * request once a cached row exists (requirement 5). */
export async function getVehicleIntelligence(
  supabase: SupabaseServerClient,
  session: SessionContext,
  vehicleId: string
): Promise<VehicleIntelligenceResult | null> {
  const { data, error } = await supabase
    .from("vehicle_intelligence")
    .select(
      "health_score, health_band, health_factors, profitability_net_mad, profitability_breakdown, utilization, recommendations, recommendations_confidence, computed_reason, computed_at"
    )
    .eq("company_id", session.company.id)
    .eq("vehicle_id", vehicleId)
    .maybeSingle()

  if (error) throw error

  if (data) {
    return {
      health: { score: data.health_score, band: data.health_band, factors: data.health_factors } as VehicleHealthResult,
      profitability: { netMad: Number(data.profitability_net_mad), breakdown: data.profitability_breakdown } as VehicleProfitabilityResult,
      utilization: data.utilization as VehicleUtilizationResult,
      recommendations: data.recommendations as VehicleRecommendation[] | null,
      recommendationsConfidence: data.recommendations_confidence as AskAiConfidence | null,
      computedReason: data.computed_reason,
      computedAt: data.computed_at,
    }
  }

  return recomputeVehicleIntelligence(supabase, session, vehicleId, "initial_view")
}
