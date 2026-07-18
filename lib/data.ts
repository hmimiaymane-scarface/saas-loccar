/**
 * Data access layer.
 *
 * Every page reads business data through the functions in this file rather
 * than querying Supabase (or the mock arrays) directly — components stay
 * unaware of where the data actually comes from.
 *
 * Data mode is explicit, not a silent fallback:
 *   - Supabase creds missing (local setup) -> mock data, always.
 *   - NEXT_PUBLIC_USE_MOCK_DATA=true -> mock data, even with creds present.
 *   - Otherwise -> Supabase, and a failed query throws. We do NOT catch a
 *     Supabase error and quietly serve mock data instead: a broken
 *     connection should surface as a broken page, not a fake demo.
 *
 * Every exported function takes an explicit `companyId` — callers get it
 * from `lib/auth/session.ts`'s `getSessionContext()`, once, at the top of
 * a layout or page.
 */

import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { vehicles as mockVehicles } from "@/lib/mock/vehicles"
import { customers as mockCustomers } from "@/lib/mock/customers"
import { bookings as mockBookings } from "@/lib/mock/bookings"
import { maintenanceAlerts as mockMaintenanceAlerts } from "@/lib/mock/maintenance"
import { recentActivity as mockRecentActivity } from "@/lib/mock/activity"
import type {
  Booking,
  BookingStatus,
  MaintenanceAlert,
  MaintenanceSeverity,
  OverviewMetrics,
  Vehicle,
  VehicleCategory,
  Customer,
  ActivityItem,
  PaymentStatus,
} from "@/types/rental"

function isMockMode() {
  return !isSupabaseConfigured || process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true"
}

function todayRange() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function monthStartIso() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

// ---------------------------------------------------------------------
// Row -> domain-type mapping
// ---------------------------------------------------------------------

interface ReservationJoinRow {
  id: string
  reference: string
  pickup_at: string
  return_at: string
  pickup_location: string | null
  return_location: string | null
  status: string
  total_amount: string
  amount_paid: string
  remaining_balance: string
  requested_category: string | null
  created_at: string
  customer: { id: string; full_name: string; phone: string } | null
  vehicle: { id: string; make: string; model: string; registration_number: string; category: string } | null
}

function paymentStatusFor(totalDue: number, amountPaid: number, remaining: number): PaymentStatus {
  if (remaining <= 0 && totalDue > 0) return "paid"
  if (amountPaid > 0) return "partial"
  return "unpaid"
}

function mapReservationRow(row: ReservationJoinRow): Booking {
  const totalDue = Number(row.total_amount)
  const amountPaid = Number(row.amount_paid)
  const remaining = Number(row.remaining_balance)
  const status = row.status as BookingStatus

  return {
    id: row.id,
    reference: row.reference,
    customer: row.customer
      ? { id: row.customer.id, fullName: row.customer.full_name, phone: row.customer.phone }
      : { id: "", fullName: "Unknown customer", phone: "" },
    vehicle: row.vehicle
      ? {
          id: row.vehicle.id,
          make: row.vehicle.make,
          model: row.vehicle.model,
          plate: row.vehicle.registration_number,
          category: row.vehicle.category as VehicleCategory,
        }
      : {
          id: "",
          make: "Unassigned",
          model: row.requested_category ? `${row.requested_category} category` : "vehicle",
          plate: "—",
          category: (row.requested_category as VehicleCategory) ?? "economy",
        },
    startDate: row.pickup_at.slice(0, 10),
    endDate: row.return_at.slice(0, 10),
    pickupLocation: row.pickup_location ?? "",
    returnLocation: row.return_location ?? "",
    status,
    isOverdue: status === "active" && new Date(row.return_at).getTime() < Date.now(),
    payment: {
      status: paymentStatusFor(totalDue, amountPaid, remaining),
      totalDueMad: totalDue,
      amountPaidMad: amountPaid,
      remainingMad: remaining,
    },
    createdAt: row.created_at,
  }
}

function mapVehicleRow(row: {
  id: string
  make: string
  model: string
  year: number
  registration_number: string
  category: string
  status: string
  daily_rate: string
  odometer_km: number
  photo_path: string | null
}): Vehicle {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    plate: row.registration_number,
    category: row.category as VehicleCategory,
    status: row.status as Vehicle["status"],
    dailyRateMad: Number(row.daily_rate),
    mileageKm: row.odometer_km,
    photoUrl: row.photo_path ?? undefined,
  }
}

function mapCustomerRow(row: {
  id: string
  full_name: string
  phone: string
  email: string | null
  license_number: string | null
  license_expires_on: string | null
}): Customer {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? undefined,
    licenseNumber: row.license_number ?? "",
    licenseExpiresAt: row.license_expires_on ?? "",
    totalBookings: 0,
  }
}

/** Days-until-due -> alert severity. Not a stored column; derived here so
 * both mock and live data go through the same rule. */
function severityForDueDate(dueDate: string): MaintenanceSeverity {
  const days = Math.floor((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days <= 2) return "critical"
  if (days <= 10) return "warning"
  return "info"
}

function mapMaintenanceRow(row: {
  id: string
  type: string
  scheduled_on: string | null
  next_service_on: string | null
  vehicle: { id: string; make: string; model: string; registration_number: string } | null
}): MaintenanceAlert | null {
  const dueDate = row.scheduled_on ?? row.next_service_on
  if (!dueDate || !row.vehicle) return null

  return {
    id: row.id,
    vehicle: {
      id: row.vehicle.id,
      make: row.vehicle.make,
      model: row.vehicle.model,
      plate: row.vehicle.registration_number,
    },
    type: row.type as MaintenanceAlert["type"],
    title: maintenanceTitle(row.type),
    dueDate,
    severity: severityForDueDate(dueDate),
  }
}

function maintenanceTitle(type: string): string {
  const labels: Record<string, string> = {
    oil_change: "Oil and filter change",
    inspection: "Technical inspection",
    tire: "Tyre replacement",
    brake: "Brake service",
    insurance_renewal: "Insurance renewal",
    registration_renewal: "Registration renewal",
    repair: "Repair",
    other: "Maintenance",
  }
  return labels[type] ?? "Maintenance"
}

function mapActivityRow(row: {
  id: string
  type: string
  title: string
  description: string | null
  created_at: string
  actor: { full_name: string | null } | null
}): ActivityItem {
  return {
    id: row.id,
    type: row.type as ActivityItem["type"],
    title: row.title,
    description: row.description ?? row.title,
    timestamp: row.created_at,
    actor: row.actor?.full_name ?? undefined,
  }
}

const RESERVATION_SELECT =
  "id, reference, pickup_at, return_at, pickup_location, return_location, status, total_amount, amount_paid, remaining_balance, requested_category, created_at, customer:customers(id, full_name, phone), vehicle:vehicles(id, make, model, registration_number, category)"

// ---------------------------------------------------------------------
// Public accessors
// ---------------------------------------------------------------------

export async function getVehicles(companyId: string): Promise<Vehicle[]> {
  if (isMockMode()) return mockVehicles

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, make, model, year, registration_number, category, status, daily_rate, odometer_km, photo_path")
    .eq("company_id", companyId)
    .order("make")

  if (error) throw error
  return (data ?? []).map(mapVehicleRow)
}

export async function getCustomers(companyId: string): Promise<Customer[]> {
  if (isMockMode()) return mockCustomers

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, license_number, license_expires_on")
    .eq("company_id", companyId)
    .order("full_name")

  if (error) throw error
  return (data ?? []).map(mapCustomerRow)
}

export async function getBookings(companyId: string): Promise<Booking[]> {
  if (isMockMode()) return mockBookings

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw error
  return ((data ?? []) as unknown as ReservationJoinRow[]).map(mapReservationRow)
}

export async function getMaintenanceAlerts(companyId: string): Promise<MaintenanceAlert[]> {
  if (isMockMode()) {
    return [...mockMaintenanceAlerts].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("maintenance_records")
    .select("id, type, scheduled_on, next_service_on, vehicle:vehicles(id, make, model, registration_number)")
    .eq("company_id", companyId)
    .in("status", ["scheduled", "in_progress"])
    .order("scheduled_on", { ascending: true, nullsFirst: false })
    .limit(10)

  if (error) throw error
  return (data ?? [])
    .map((row) => mapMaintenanceRow(row as never))
    .filter((alert): alert is MaintenanceAlert => alert !== null)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
}

export async function getRecentActivity(companyId: string, limit = 6): Promise<ActivityItem[]> {
  if (isMockMode()) {
    return [...mockRecentActivity]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, type, title, description, created_at, actor:profiles(full_name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => mapActivityRow(row as never))
}

export async function getTodayPickups(companyId: string): Promise<Booking[]> {
  if (isMockMode()) {
    const TODAY = "2026-07-18"
    return mockBookings.filter((b) => b.startDate === TODAY && b.status !== "cancelled")
  }

  const supabase = await createClient()
  const { startIso, endIso } = todayRange()
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("company_id", companyId)
    .gte("pickup_at", startIso)
    .lt("pickup_at", endIso)
    .neq("status", "cancelled")
    .order("pickup_at")

  if (error) throw error
  return ((data ?? []) as unknown as ReservationJoinRow[]).map(mapReservationRow)
}

export async function getTodayReturns(companyId: string): Promise<Booking[]> {
  if (isMockMode()) {
    const TODAY = "2026-07-18"
    return mockBookings.filter((b) => b.endDate === TODAY && b.status === "active")
  }

  const supabase = await createClient()
  const { startIso, endIso } = todayRange()
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("company_id", companyId)
    .gte("return_at", startIso)
    .lt("return_at", endIso)
    .eq("status", "active")
    .order("return_at")

  if (error) throw error
  return ((data ?? []) as unknown as ReservationJoinRow[]).map(mapReservationRow)
}

export async function getRecentBookingRequests(companyId: string, limit = 4): Promise<Booking[]> {
  if (isMockMode()) {
    return mockBookings
      .filter((b) => b.status === "request")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("company_id", companyId)
    .eq("status", "request")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return ((data ?? []) as unknown as ReservationJoinRow[]).map(mapReservationRow)
}

export async function getOverviewMetrics(companyId: string): Promise<OverviewMetrics> {
  const [todayPickups, todayReturns] = await Promise.all([
    getTodayPickups(companyId),
    getTodayReturns(companyId),
  ])

  if (isMockMode()) {
    const fleetTotal = mockVehicles.length
    const fleetAvailable = mockVehicles.filter((v) => v.status === "available").length
    const fleetRented = mockVehicles.filter((v) => v.status === "rented").length
    const fleetReserved = mockVehicles.filter((v) => v.status === "reserved").length
    const fleetMaintenance = mockVehicles.filter(
      (v) => v.status === "maintenance" || v.status === "unavailable"
    ).length
    const outstandingBalanceMad = mockBookings
      .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
      .reduce((sum, b) => sum + b.payment.remainingMad, 0)

    return {
      revenueTodayMad: 8450,
      revenueThisMonthMad: 187300,
      outstandingBalanceMad,
      fleetTotal,
      fleetAvailable,
      fleetRented,
      fleetReserved,
      fleetMaintenance,
      occupancyRate: fleetTotal > 0 ? Math.round((fleetRented / fleetTotal) * 100) : 0,
      todayPickupsCount: todayPickups.length,
      todayReturnsCount: todayReturns.length,
    }
  }

  const supabase = await createClient()
  const { startIso: todayStartIso, endIso: todayEndIso } = todayRange()

  const [vehicleRows, reservationRows, todayPayments, monthPayments] = await Promise.all([
    supabase.from("vehicles").select("status").eq("company_id", companyId),
    supabase
      .from("reservations")
      .select("remaining_balance, status")
      .eq("company_id", companyId)
      .not("status", "in", "(cancelled,no_show)"),
    supabase
      .from("payments")
      .select("amount")
      .eq("company_id", companyId)
      .gte("paid_at", todayStartIso)
      .lt("paid_at", todayEndIso),
    supabase
      .from("payments")
      .select("amount")
      .eq("company_id", companyId)
      .gte("paid_at", monthStartIso()),
  ])

  if (vehicleRows.error) throw vehicleRows.error
  if (reservationRows.error) throw reservationRows.error
  if (todayPayments.error) throw todayPayments.error
  if (monthPayments.error) throw monthPayments.error

  const vehicleStatuses = vehicleRows.data ?? []
  const fleetTotal = vehicleStatuses.length
  const fleetAvailable = vehicleStatuses.filter((v) => v.status === "available").length
  const fleetRented = vehicleStatuses.filter((v) => v.status === "rented").length
  const fleetReserved = vehicleStatuses.filter((v) => v.status === "reserved").length
  const fleetMaintenance = vehicleStatuses.filter(
    (v) => v.status === "maintenance" || v.status === "unavailable"
  ).length

  const outstandingBalanceMad = (reservationRows.data ?? []).reduce(
    (sum, r) => sum + Number(r.remaining_balance),
    0
  )
  const revenueTodayMad = (todayPayments.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
  const revenueThisMonthMad = (monthPayments.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0)

  return {
    revenueTodayMad,
    revenueThisMonthMad,
    outstandingBalanceMad,
    fleetTotal,
    fleetAvailable,
    fleetRented,
    fleetReserved,
    fleetMaintenance,
    occupancyRate: fleetTotal > 0 ? Math.round((fleetRented / fleetTotal) * 100) : 0,
    todayPickupsCount: todayPickups.length,
    todayReturnsCount: todayReturns.length,
  }
}
