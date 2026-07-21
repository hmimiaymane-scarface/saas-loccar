import { createClient } from "@/lib/supabase/server"
import type { VehicleCategory } from "@/types/rental"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Marketing segmentation groundwork (roadmap phase 08 requirement 4,
 * bible Ch. 5 §17). Query logic only — there is no campaign/messaging
 * sending infrastructure in this codebase, and building one is
 * explicitly out of scope for this phase (non-goal). The bible's
 * constraint is explicit and non-negotiable: segmentation is "only
 * with customer consent" — every function here filters
 * `marketing_consent = true` before anything else, and that's what
 * lib/__tests__/customer-segments.test.ts's "never returns a customer
 * without consent" tests exist to prove, not just assume.
 */

export interface CustomerSegmentMember {
  customerId: string
  fullName: string
  phone: string
  email: string | null
}

function mapSegmentRow(row: { id: string; full_name: string; phone: string; email: string | null }): CustomerSegmentMember {
  return { customerId: row.id, fullName: row.full_name, phone: row.phone, email: row.email }
}

/** Customers who have rented at least once but not within the last
 * `monthsInactive` months. A customer with zero reservations ever
 * isn't "inactive" (they're "never active" — a different, not-yet-
 * built segment); this only flags a real lapse in an existing
 * relationship. */
export async function getInactiveCustomers(
  supabase: SupabaseServerClient,
  companyId: string,
  monthsInactive: number,
  now: Date = new Date()
): Promise<CustomerSegmentMember[]> {
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - monthsInactive)
  const cutoffIso = cutoff.toISOString()

  const [recentRes, everRes] = await Promise.all([
    supabase.from("reservations").select("customer_id").eq("company_id", companyId).gte("pickup_at", cutoffIso),
    supabase.from("reservations").select("customer_id").eq("company_id", companyId),
  ])
  if (recentRes.error) throw recentRes.error
  if (everRes.error) throw everRes.error

  const recentlyActiveIds = new Set((recentRes.data ?? []).map((r) => r.customer_id as string))
  const everActiveIds = new Set((everRes.data ?? []).map((r) => r.customer_id as string))

  let query = supabase
    .from("customers")
    .select("id, full_name, phone, email")
    .eq("company_id", companyId)
    .eq("marketing_consent", true)
  if (recentlyActiveIds.size > 0) {
    query = query.not("id", "in", `(${[...recentlyActiveIds].join(",")})`)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).filter((c) => everActiveIds.has(c.id as string)).map((c) => mapSegmentRow(c as never))
}

/** Consented customers who've rented a vehicle of `category` at least
 * `minReservations` times (active or completed reservations only —
 * a cancelled/no-show booking never actually happened). */
export async function getFrequentCategoryRenters(
  supabase: SupabaseServerClient,
  companyId: string,
  category: VehicleCategory,
  minReservations = 3
): Promise<CustomerSegmentMember[]> {
  const { data: reservationRows, error: reservationError } = await supabase
    .from("reservations")
    .select("customer_id, vehicle:vehicles(category)")
    .eq("company_id", companyId)
    .in("status", ["active", "completed"])
  if (reservationError) throw reservationError

  const countsByCustomer = new Map<string, number>()
  for (const row of reservationRows ?? []) {
    const vehicleCategory = (row.vehicle as unknown as { category: string } | null)?.category
    if (vehicleCategory !== category) continue
    const customerId = row.customer_id as string
    countsByCustomer.set(customerId, (countsByCustomer.get(customerId) ?? 0) + 1)
  }

  const qualifyingIds = [...countsByCustomer.entries()].filter(([, count]) => count >= minReservations).map(([id]) => id)
  if (qualifyingIds.length === 0) return []

  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email")
    .eq("company_id", companyId)
    .eq("marketing_consent", true)
    .in("id", qualifyingIds)
  if (error) throw error

  return (data ?? []).map((c) => mapSegmentRow(c as never))
}

/** True when `dateOfBirth`'s month/day falls within the next
 * `withinDays` days of `now` — year-agnostic, handling the December-
 * into-January wraparound. Pure so the wraparound logic is
 * unit-testable without a database. */
export function isBirthdayWithinDays(dateOfBirth: string, withinDays: number, now: Date = new Date()): boolean {
  const dob = new Date(dateOfBirth)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const thisYear = new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()))

  let diffDays = Math.round((thisYear.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) {
    const nextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, dob.getUTCMonth(), dob.getUTCDate()))
    diffDays = Math.round((nextYear.getTime() - today.getTime()) / 86_400_000)
  }

  return diffDays >= 0 && diffDays <= withinDays
}

/** Consented customers whose birthday falls within the next
 * `withinDays` days. Customers with no date_of_birth on file are
 * excluded (nothing to check), not treated as a match. */
export async function getUpcomingBirthdays(
  supabase: SupabaseServerClient,
  companyId: string,
  withinDays: number,
  now: Date = new Date()
): Promise<CustomerSegmentMember[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, date_of_birth")
    .eq("company_id", companyId)
    .eq("marketing_consent", true)
    .not("date_of_birth", "is", null)
  if (error) throw error

  return (data ?? [])
    .filter((c) => isBirthdayWithinDays(c.date_of_birth as string, withinDays, now))
    .map((c) => mapSegmentRow(c as never))
}
