import { occupancyRate, downtimeDays as downtimeDaysFn, rentalDaysFor } from "@/lib/reports"
import type {
  DamageStatus,
  DamageSeverity,
  MaintenanceRecordStatus,
  OverallCondition,
  Cleanliness,
  ExpenseCategory,
} from "@/types/rental"

/**
 * Pure vehicle scoring (roadmap phase 06 — the bible's Pillar One,
 * "Fleet Intelligence"; Ch. 5 §7-12). No Supabase dependency, so every
 * formula here is unit-testable against hand-computed fixtures — see
 * lib/__tests__/vehicle-intelligence.test.ts. The DB-facing side that
 * gathers real data and calls these is
 * lib/vehicle-intelligence-store.ts.
 *
 * The bible lists ten health factors: mechanical condition, maintenance
 * frequency, damage frequency, customer complaints, cleaning quality,
 * inspection results, insurance status, age, mileage, downtime. This
 * codebase has real data for eight of them today — "customer
 * complaints" has no dedicated field anywhere (not in reservations,
 * inspections, or a support-ticket concept), and "mechanical condition"
 * isn't a standalone field either, so it's approximated from inspection
 * `overallCondition` ratings and maintenance status rather than a
 * purpose-built measurement. Both gaps are called out at the factor
 * definitions below rather than silently guessed at — see
 * docs/vehicle-intelligence.md.
 */

// ---------------------------------------------------------------------
// Health score
// ---------------------------------------------------------------------

export type HealthBand = "excellent" | "good" | "fair" | "poor"

export interface HealthFactor {
  key: string
  label: string
  /** 0-100, already normalized — not yet weighted. */
  score: number
  /** Out of 100, all factor weights sum to 100. */
  weight: number
  note?: string
}

export interface VehicleHealthResult {
  score: number
  band: HealthBand
  factors: HealthFactor[]
}

export interface VehicleHealthInput {
  ageYears: number
  mileageKm: number
  /** Every maintenance record for the vehicle, any status. */
  maintenanceRecords: { status: MaintenanceRecordStatus; scheduledOn: string | null }[]
  /** Every damage for the vehicle, any status. */
  damages: { status: DamageStatus; severity: DamageSeverity; preExisting: boolean }[]
  /** Most recent inspections first — only the most recent few are used
   * (older condition ratings say less about the vehicle today). */
  inspections: { overallCondition: OverallCondition | null; cleanliness: Cleanliness | null }[]
  insuranceExpiresOn: string | null
  registrationExpiresOn: string | null
  inspectionExpiresOn: string | null
  downtimeDays: number
  totalDays: number
  now?: Date
}

/** Weights sum to 100 — documented here once so the breakdown UI and
 * this module can't drift apart. Damage history and maintenance status
 * carry the most weight because they're the strongest, most direct
 * signals this codebase actually has; "age & mileage" and "downtime"
 * are weighted lightly since they're weaker, more indirect proxies. */
export const HEALTH_FACTOR_WEIGHTS = {
  damage: 25,
  maintenance: 20,
  inspection: 20,
  compliance: 15,
  ageMileage: 15,
  downtime: 5,
} as const

const CONDITION_SCORE: Record<OverallCondition, number> = { excellent: 100, good: 80, fair: 50, poor: 20 }
const CLEANLINESS_SCORE: Record<Cleanliness, number> = { clean: 100, average: 60, dirty: 20 }
const DAMAGE_SEVERITY_PENALTY: Record<DamageSeverity, number> = { minor: 5, moderate: 15, severe: 30 }
const OPEN_DAMAGE_STATUSES: DamageStatus[] = [
  "newly_discovered",
  "under_review",
  "customer_responsible",
  "agency_responsible",
  "repair_planned",
]

/** Approximates "mechanical condition" + "inspection results" from the
 * most recent 5 inspections' overallCondition/cleanliness ratings.
 * Neutral default (70) when there's no inspection history yet — new
 * vehicles shouldn't start with a penalized score for lack of data. */
function scoreInspections(inspections: VehicleHealthInput["inspections"]): number {
  const recent = inspections.slice(0, 5)
  const ratings: number[] = []
  for (const insp of recent) {
    if (insp.overallCondition) ratings.push(CONDITION_SCORE[insp.overallCondition])
    if (insp.cleanliness) ratings.push(CLEANLINESS_SCORE[insp.cleanliness])
  }
  if (ratings.length === 0) return 70
  return Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
}

/** Pre-existing damages (present at acquisition) don't penalize —
 * they're a baseline condition, not a fleet-management outcome. Open/
 * unresolved damages count at full severity weight; resolved ones count
 * at half, since a closed damage still happened but no longer affects
 * the vehicle today. */
function scoreDamages(damages: VehicleHealthInput["damages"]): number {
  let penalty = 0
  for (const d of damages) {
    if (d.preExisting) continue
    const base = DAMAGE_SEVERITY_PENALTY[d.severity]
    penalty += OPEN_DAMAGE_STATUSES.includes(d.status) ? base : base / 2
  }
  return Math.max(0, 100 - penalty)
}

/** "Maintenance frequency" approximated as: is anything currently
 * overdue or stalled. A high volume of *completed, on-time* maintenance
 * isn't penalized — routine servicing is healthy, not a red flag. */
function scoreMaintenance(records: VehicleHealthInput["maintenanceRecords"], now: Date): number {
  let penalty = 0
  for (const r of records) {
    if ((r.status === "planned" || r.status === "scheduled") && r.scheduledOn && new Date(r.scheduledOn) < now) {
      penalty += 20
    }
    if (r.status === "waiting_for_parts") penalty += 10
  }
  return Math.max(0, 100 - penalty)
}

/** Worst of the three compliance dates: expired = 0, expiring within 30
 * days = 50, valid (or unknown/not tracked) = 100. */
function scoreCompliance(
  insuranceExpiresOn: string | null,
  registrationExpiresOn: string | null,
  inspectionExpiresOn: string | null,
  now: Date
): number {
  let worst = 100
  for (const dateStr of [insuranceExpiresOn, registrationExpiresOn, inspectionExpiresOn]) {
    if (!dateStr) continue
    const daysUntil = Math.floor((new Date(dateStr).getTime() - now.getTime()) / 86_400_000)
    const score = daysUntil < 0 ? 0 : daysUntil <= 30 ? 50 : 100
    worst = Math.min(worst, score)
  }
  return worst
}

/** Simple linear degradation curves — 0 by ~12.5 years old or 200,000
 * km, whichever bites first. A rough proxy, not a manufacturer-specific
 * depreciation model. */
function scoreAgeMileage(ageYears: number, mileageKm: number): number {
  const ageScore = Math.max(0, 100 - ageYears * 8)
  const mileageScore = Math.max(0, 100 - (mileageKm / 200_000) * 100)
  return Math.round((ageScore + mileageScore) / 2)
}

function scoreDowntime(downtime: number, totalDays: number): number {
  if (totalDays <= 0) return 100
  const ratio = downtime / totalDays
  return Math.max(0, Math.round(100 - ratio * 100))
}

export function bandForScore(score: number): HealthBand {
  if (score >= 85) return "excellent"
  if (score >= 65) return "good"
  if (score >= 40) return "fair"
  return "poor"
}

export function computeVehicleHealth(input: VehicleHealthInput): VehicleHealthResult {
  const now = input.now ?? new Date()

  const factors: HealthFactor[] = [
    {
      key: "damage",
      label: "Damage history",
      score: scoreDamages(input.damages),
      weight: HEALTH_FACTOR_WEIGHTS.damage,
    },
    {
      key: "maintenance",
      label: "Maintenance status",
      score: scoreMaintenance(input.maintenanceRecords, now),
      weight: HEALTH_FACTOR_WEIGHTS.maintenance,
    },
    {
      key: "inspection",
      label: "Inspection results",
      score: scoreInspections(input.inspections),
      weight: HEALTH_FACTOR_WEIGHTS.inspection,
      note: "Approximates mechanical condition — no dedicated field for it yet.",
    },
    {
      key: "compliance",
      label: "Insurance / registration / inspection status",
      score: scoreCompliance(input.insuranceExpiresOn, input.registrationExpiresOn, input.inspectionExpiresOn, now),
      weight: HEALTH_FACTOR_WEIGHTS.compliance,
    },
    {
      key: "age_mileage",
      label: "Age & mileage",
      score: scoreAgeMileage(input.ageYears, input.mileageKm),
      weight: HEALTH_FACTOR_WEIGHTS.ageMileage,
    },
    {
      key: "downtime",
      label: "Downtime",
      score: scoreDowntime(input.downtimeDays, input.totalDays),
      weight: HEALTH_FACTOR_WEIGHTS.downtime,
    },
  ]

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  const score = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight)

  return { score, band: bandForScore(score), factors }
}

// ---------------------------------------------------------------------
// Profitability
// ---------------------------------------------------------------------

export interface VehicleProfitabilityInput {
  rentalIncomeMad: number
  maintenanceCostMad: number
  damageCostMad: number
  insuranceCostMad: number
  cleaningCostMad: number
  otherExpensesMad: number
  /** Estimated opportunity cost of idle days (idleDays * dailyRateMad) —
   * clearly labeled as an estimate in the breakdown, never presented as
   * a recorded cost the way the others are. */
  downtimeCostMad: number
}

export interface ProfitabilityLineItem {
  label: string
  amountMad: number
  direction: "in" | "out"
  /** True only for the estimated-opportunity-cost line — see
   * downtimeCostMad above. */
  isEstimate?: boolean
}

export interface VehicleProfitabilityResult {
  netMad: number
  breakdown: ProfitabilityLineItem[]
}

/** Rental income minus every recorded cost category the bible lists —
 * maintenance, damage repair, insurance, cleaning, other recorded
 * expenses, plus an estimated downtime opportunity cost. Every input
 * here is a plain number the caller has already summed from real rows
 * (lib/vehicle-intelligence-store.ts), so this function is just the
 * arithmetic and the presentation shape — deliberately a breakdown, not
 * just a final number, since owners need to see where it came from to
 * trust it (requirement 2). */
export function computeVehicleProfitability(input: VehicleProfitabilityInput): VehicleProfitabilityResult {
  const breakdown: ProfitabilityLineItem[] = [
    { label: "Rental income", amountMad: input.rentalIncomeMad, direction: "in" },
    { label: "Maintenance", amountMad: input.maintenanceCostMad, direction: "out" },
    { label: "Damage repairs", amountMad: input.damageCostMad, direction: "out" },
    { label: "Insurance", amountMad: input.insuranceCostMad, direction: "out" },
    { label: "Cleaning", amountMad: input.cleaningCostMad, direction: "out" },
    { label: "Other recorded expenses", amountMad: input.otherExpensesMad, direction: "out" },
    { label: "Estimated downtime cost", amountMad: input.downtimeCostMad, direction: "out", isEstimate: true },
  ]
  const netMad = Math.round(breakdown.reduce((sum, b) => sum + (b.direction === "in" ? b.amountMad : -b.amountMad), 0) * 100) / 100
  return { netMad, breakdown }
}

// ---------------------------------------------------------------------
// Utilization
// ---------------------------------------------------------------------

export interface VehicleUtilizationInput {
  rentedDays: number
  totalDaysTracked: number
  reservationCount: number
  revenueMad: number
  /** Only present when there's rental history to derive it from — see
   * splitWeekdayWeekend. */
  weekdayVsWeekend?: { weekdayDays: number; weekendDays: number }
}

export interface VehicleUtilizationResult {
  occupancyRatePercent: number
  idleDays: number
  reservationCount: number
  revenuePerDayMad: number
  weekdayVsWeekend: { weekdayDays: number; weekendDays: number } | null
}

/** Reuses lib/reports.ts's occupancyRate/downtimeDays directly (with
 * fleetSize=1, since this is a single vehicle) rather than a parallel
 * definition — this codebase's existing rule is "the overview, reports,
 * vehicle details and CSV exports must use the same definitions." */
export function computeVehicleUtilization(input: VehicleUtilizationInput): VehicleUtilizationResult {
  return {
    occupancyRatePercent: occupancyRate(input.rentedDays, 1, input.totalDaysTracked),
    idleDays: downtimeDaysFn(input.totalDaysTracked, input.rentedDays),
    reservationCount: input.reservationCount,
    revenuePerDayMad: input.rentedDays > 0 ? Math.round((input.revenueMad / input.rentedDays) * 100) / 100 : 0,
    weekdayVsWeekend: input.weekdayVsWeekend ?? null,
  }
}

/** Counts calendar days (UTC-day-based, half-open [start, end) — same
 * inclusive/exclusive convention as lib/reports.ts's period ranges) that
 * fall on a weekend (Sat/Sun) vs a weekday across every given
 * reservation window. A UTC-day approximation rather than the company's
 * own timezone — acceptable for a coarse weekday/weekend split, called
 * out in docs/vehicle-intelligence.md. */
export function splitWeekdayWeekend(dateRanges: { startIso: string; endIso: string }[]): {
  weekdayDays: number
  weekendDays: number
} {
  let weekdayDays = 0
  let weekendDays = 0

  for (const { startIso, endIso } of dateRanges) {
    const start = new Date(startIso)
    const end = new Date(endIso)
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))

    while (cursor < endDay) {
      const dow = cursor.getUTCDay()
      if (dow === 0 || dow === 6) weekendDays++
      else weekdayDays++
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }

  return { weekdayDays, weekendDays }
}

// ---------------------------------------------------------------------
// Raw-data assembly — bridges what lib/vehicle-intelligence-store.ts
// fetches from the database into the three compute functions' inputs.
// Pure (no Supabase dependency) specifically so this mapping is
// unit-testable against hand-built fixtures without mocking a database
// — see lib/__tests__/vehicle-intelligence.test.ts's
// "buildVehicleIntelligenceInputs" suite, which is what satisfies the
// phase brief's "given a vehicle with known maintenance/damage/
// reservation history in test fixtures, the calculations produce
// correct, testable numbers."
// ---------------------------------------------------------------------

export interface VehicleRawData {
  year: number
  odometerKm: number
  dailyRateMad: number
  /** Null when not recorded — falls back to the earliest counted
   * reservation's pickup date, then to "yesterday" as a last resort
   * (see buildVehicleIntelligenceInputs) so totalDays is never 0. */
  acquiredOn: string | null
  insuranceExpiresOn: string | null
  registrationExpiresOn: string | null
  inspectionExpiresOn: string | null
  maintenanceRecords: { status: MaintenanceRecordStatus; scheduledOn: string | null }[]
  damages: {
    status: DamageStatus
    severity: DamageSeverity
    preExisting: boolean
    actualCostMad: number | null
    estimatedCostMad: number | null
  }[]
  /** Most recent first. */
  inspections: { overallCondition: OverallCondition | null; cleanliness: Cleanliness | null }[]
  /** Only active/completed reservations belong here — the caller
   * filters at the query layer (cancelled/no_show/request/pending
   * reservations never occupied the vehicle). */
  countedReservations: { pickupAt: string; returnAt: string }[]
  /** Sum of recorded rental_payment transactions for this vehicle —
   * same definition as lib/data.ts#getFleetPerformanceReport's
   * `recordedRevenueMad`, so this and the reports feature never
   * disagree about what "this vehicle's revenue" means. */
  rentalIncomeMad: number
  expensesByCategory: Partial<Record<ExpenseCategory, number>>
}

export interface VehicleIntelligenceInputs {
  health: VehicleHealthInput
  profitability: VehicleProfitabilityInput
  utilization: VehicleUtilizationInput
}

const EXPENSE_CATEGORIES_ALREADY_BROKEN_OUT: ExpenseCategory[] = ["maintenance", "insurance", "cleaning"]

/** Assembles the three compute functions' inputs from one bundle of raw
 * (already-fetched) vehicle data. `now` defaults to the real current
 * time but is overridable for deterministic tests. */
export function buildVehicleIntelligenceInputs(raw: VehicleRawData, now: Date = new Date()): VehicleIntelligenceInputs {
  const ageYears = now.getUTCFullYear() - raw.year

  const rentedDays = raw.countedReservations.reduce((sum, r) => sum + rentalDaysFor(r.pickupAt, r.returnAt), 0)

  const acquiredOn = raw.acquiredOn ? new Date(raw.acquiredOn) : null
  const earliestPickupMs =
    raw.countedReservations.length > 0 ? Math.min(...raw.countedReservations.map((r) => new Date(r.pickupAt).getTime())) : null
  const trackedSince = acquiredOn ?? (earliestPickupMs != null ? new Date(earliestPickupMs) : new Date(now.getTime() - 86_400_000))
  const totalDaysTracked = Math.max(1, Math.round((now.getTime() - trackedSince.getTime()) / 86_400_000))

  const idleDays = downtimeDaysFn(totalDaysTracked, rentedDays)

  const maintenanceCostMad = raw.expensesByCategory.maintenance ?? 0
  const insuranceCostMad = raw.expensesByCategory.insurance ?? 0
  const cleaningCostMad = raw.expensesByCategory.cleaning ?? 0
  const otherExpensesMad = (Object.entries(raw.expensesByCategory) as [ExpenseCategory, number][])
    .filter(([category]) => !EXPENSE_CATEGORIES_ALREADY_BROKEN_OUT.includes(category))
    .reduce((sum, [, amount]) => sum + amount, 0)

  const damageCostMad = raw.damages.reduce((sum, d) => sum + (d.actualCostMad ?? d.estimatedCostMad ?? 0), 0)

  const weekdayVsWeekend =
    raw.countedReservations.length > 0
      ? splitWeekdayWeekend(raw.countedReservations.map((r) => ({ startIso: r.pickupAt, endIso: r.returnAt })))
      : undefined

  return {
    health: {
      ageYears,
      mileageKm: raw.odometerKm,
      maintenanceRecords: raw.maintenanceRecords,
      damages: raw.damages.map(({ status, severity, preExisting }) => ({ status, severity, preExisting })),
      inspections: raw.inspections,
      insuranceExpiresOn: raw.insuranceExpiresOn,
      registrationExpiresOn: raw.registrationExpiresOn,
      inspectionExpiresOn: raw.inspectionExpiresOn,
      downtimeDays: idleDays,
      totalDays: totalDaysTracked,
      now,
    },
    profitability: {
      rentalIncomeMad: raw.rentalIncomeMad,
      maintenanceCostMad,
      damageCostMad,
      insuranceCostMad,
      cleaningCostMad,
      otherExpensesMad,
      downtimeCostMad: Math.round(idleDays * raw.dailyRateMad * 100) / 100,
    },
    utilization: {
      rentedDays,
      totalDaysTracked,
      reservationCount: raw.countedReservations.length,
      revenueMad: raw.rentalIncomeMad,
      weekdayVsWeekend,
    },
  }
}
