import type { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/env"
import { findCustomersMissingIdentityDocument, type UpcomingPickupCustomer, type MissingIdentityDocumentFlag } from "@/lib/customer-readiness"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Productization wave 1 phase 11 — the database-facing half of
 * `lib/customer-readiness.ts#findCustomersMissingIdentityDocument`.
 * Fetches every customer with a pickup coming up soon plus their
 * identity-document uploads, shapes them into that pure function's
 * input, and returns its result — no readiness logic lives here.
 */
export const MISSING_DOCUMENT_WINDOW_DAYS = 3

/** Mirrors lib/data.ts's own private isMockMode() (not exported from
 * there) — same reasoning as lib/mobile/mission-feed-data.ts's own
 * identical comment: kept in sync deliberately rather than exporting a
 * cross-cutting helper for one more caller. */
function isMockMode(): boolean {
  return !isSupabaseConfigured || process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true"
}

/**
 * No mock-mode data exists for this check (same as contracts — mock
 * fixtures have no reservation/customer linkage rich enough to
 * simulate readiness), so mock mode always returns empty, matching
 * every other AI/database-only feature's degrade convention.
 */
export async function getUpcomingReservationsMissingIdentityDocument(
  supabase: SupabaseServerClient | null,
  companyId: string
): Promise<MissingIdentityDocumentFlag[]> {
  if (isMockMode() || !supabase) return []

  const now = new Date()
  const windowEnd = new Date(now.getTime() + MISSING_DOCUMENT_WINDOW_DAYS * 86_400_000)

  const { data: reservationRows, error } = await supabase
    .from("reservations")
    .select("id, pickup_at, customer:customers(id, full_name, license_expires_on)")
    .eq("company_id", companyId)
    .in("status", ["pending", "confirmed"])
    .gte("pickup_at", now.toISOString())
    .lt("pickup_at", windowEnd.toISOString())
    .order("pickup_at")

  if (error) throw error

  const reservations = (reservationRows ?? []) as unknown as {
    id: string
    pickup_at: string
    customer: { id: string; full_name: string; license_expires_on: string | null } | null
  }[]

  const customerIds = [...new Set(reservations.map((r) => r.customer?.id).filter((id): id is string => Boolean(id)))]
  if (customerIds.length === 0) return []

  const { data: documentRows, error: documentsError } = await supabase
    .from("documents")
    .select("customer_id, expires_on")
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("category", "identity_document")
    .in("customer_id", customerIds)

  if (documentsError) throw documentsError

  const documentsByCustomer = new Map<string, { customer_id: string; expires_on: string | null }[]>()
  for (const row of (documentRows ?? []) as { customer_id: string; expires_on: string | null }[]) {
    const list = documentsByCustomer.get(row.customer_id) ?? []
    list.push(row)
    documentsByCustomer.set(row.customer_id, list)
  }

  const upcomingCustomers: UpcomingPickupCustomer[] = reservations
    .filter((r): r is typeof r & { customer: NonNullable<(typeof r)["customer"]> } => Boolean(r.customer))
    .map((r) => ({
      customerId: r.customer.id,
      customerName: r.customer.full_name,
      reservationId: r.id,
      pickupAt: r.pickup_at,
      licenseExpiresAt: r.customer.license_expires_on,
      documents: (documentsByCustomer.get(r.customer.id) ?? []).map((d) => ({ category: "identity_document", expiresOn: d.expires_on })),
    }))

  return findCustomersMissingIdentityDocument(upcomingCustomers)
}
