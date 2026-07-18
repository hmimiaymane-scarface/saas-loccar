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
 * a layout or page. Mutations (creating/editing/cancelling reservations
 * and vehicles) live in each route's `actions.ts`, not here — this file
 * is read-only by convention.
 */

import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { vehicles as mockVehicles } from "@/lib/mock/vehicles"
import { customers as mockCustomers } from "@/lib/mock/customers"
import { bookings as mockBookings } from "@/lib/mock/bookings"
import { maintenanceAlerts as mockMaintenanceAlerts } from "@/lib/mock/maintenance"
import { recentActivity as mockRecentActivity } from "@/lib/mock/activity"
import { branches as mockBranches } from "@/lib/mock/branches"
import {
  BLOCKING_RESERVATION_STATUSES,
  isVehicleAvailable,
  periodsOverlap,
  type ExistingReservationWindow,
} from "@/lib/availability"
import type {
  Booking,
  BookingStatus,
  Branch,
  FuelType,
  MaintenanceAlert,
  MaintenanceSeverity,
  OverviewMetrics,
  ReservationDetail,
  Transmission,
  Vehicle,
  VehicleCategory,
  VehicleDetail,
  VehicleStatus,
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

/** Strips characters that would break PostgREST's `.or()`/`ilike` filter
 * syntax out of free-text search input. */
function escapeIlike(value: string): string {
  return value.replace(/[%,()]/g, "").trim()
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
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
      : null,
    requestedCategory: row.vehicle ? null : ((row.requested_category as VehicleCategory) ?? null),
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
    status: row.status as VehicleStatus,
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

const RESERVATION_DETAIL_SELECT =
  "id, reference, pickup_at, return_at, pickup_location, return_location, status, source, daily_rate, num_days, discount_amount, total_amount, amount_paid, remaining_balance, deposit_amount, notes, requested_category, created_at, created_by, branch:branches(id, name), customer:customers(id, full_name, phone, email, license_number), vehicle:vehicles(id, make, model, registration_number, category)"

// ---------------------------------------------------------------------
// Company reference data
// ---------------------------------------------------------------------

export async function getBranches(companyId: string): Promise<Branch[]> {
  if (isMockMode()) return mockBranches

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, city, is_main")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("is_main", { ascending: false })

  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, city: r.city, isMain: r.is_main }))
}

// ---------------------------------------------------------------------
// Vehicles
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

export interface VehicleListFilters {
  search?: string
  status?: VehicleStatus
  category?: VehicleCategory
  branchId?: string
}

export async function getVehiclesList(
  companyId: string,
  filters: VehicleListFilters = {},
  page = 1,
  pageSize = 24
): Promise<PaginatedResult<Vehicle>> {
  if (isMockMode()) {
    let items = [...mockVehicles]
    if (filters.status) items = items.filter((v) => v.status === filters.status)
    if (filters.category) items = items.filter((v) => v.category === filters.category)
    if (filters.search) {
      const q = filters.search.toLowerCase()
      items = items.filter((v) => `${v.make} ${v.model} ${v.plate}`.toLowerCase().includes(q))
    }
    const total = items.length
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total, page, pageSize }
  }

  const supabase = await createClient()
  let query = supabase
    .from("vehicles")
    .select(
      "id, make, model, year, registration_number, category, status, daily_rate, odometer_km, photo_path",
      { count: "exact" }
    )
    .eq("company_id", companyId)

  if (filters.status) query = query.eq("status", filters.status)
  if (filters.category) query = query.eq("category", filters.category)
  if (filters.branchId) query = query.eq("branch_id", filters.branchId)
  if (filters.search) {
    const q = escapeIlike(filters.search)
    query = query.or(`make.ilike.%${q}%,model.ilike.%${q}%,registration_number.ilike.%${q}%`)
  }

  const start = (page - 1) * pageSize
  const { data, error, count } = await query.order("make").range(start, start + pageSize - 1)

  if (error) throw error
  return { items: (data ?? []).map(mapVehicleRow), total: count ?? 0, page, pageSize }
}

export async function getVehicleDetail(
  companyId: string,
  vehicleId: string
): Promise<VehicleDetail | null> {
  if (isMockMode()) {
    const v = mockVehicles.find((v) => v.id === vehicleId)
    if (!v) return null
    const related = mockBookings.filter((b) => b.vehicle?.id === vehicleId)
    const nowMs = Date.now()
    const current = related.find((b) => b.status === "active") ?? null
    const upcoming = related
      .filter(
        (b) =>
          ["confirmed", "pending", "request"].includes(b.status) &&
          new Date(b.startDate).getTime() >= nowMs
      )
      .slice(0, 5)
    const recent = related.filter((b) => b.status === "completed").slice(0, 5)

    return {
      ...v,
      branchId: mockBranches[0]?.id ?? null,
      branchName: mockBranches[0]?.name ?? null,
      color: null,
      seats: 5,
      fuelType: "petrol",
      transmission: "manual",
      depositMad: null,
      insuranceExpiresOn: null,
      registrationExpiresOn: null,
      inspectionExpiresOn: null,
      currentReservation: current,
      upcomingReservations: upcoming,
      recentReservations: recent,
    }
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("vehicles")
    .select(
      "id, make, model, year, registration_number, category, status, daily_rate, odometer_km, photo_path, branch_id, color, seats, fuel_type, transmission, deposit_amount, insurance_expires_on, registration_expires_on, inspection_expires_on, branch:branches(name)"
    )
    .eq("company_id", companyId)
    .eq("id", vehicleId)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const { data: relatedRows, error: relError } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("company_id", companyId)
    .eq("vehicle_id", vehicleId)
    .order("pickup_at", { ascending: false })
    .limit(20)

  if (relError) throw relError
  const related = ((relatedRows ?? []) as unknown as ReservationJoinRow[]).map(mapReservationRow)
  const nowMs = Date.now()
  const current = related.find((b) => b.status === "active") ?? null
  const upcoming = related
    .filter(
      (b) => ["confirmed", "pending", "request"].includes(b.status) && new Date(b.startDate).getTime() >= nowMs
    )
    .slice(0, 5)
  const recent = related.filter((b) => b.status === "completed").slice(0, 5)

  const branch = row.branch as unknown as { name: string } | null

  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    plate: row.registration_number,
    category: row.category as VehicleCategory,
    status: row.status as VehicleStatus,
    dailyRateMad: Number(row.daily_rate),
    mileageKm: row.odometer_km,
    photoUrl: row.photo_path ?? undefined,
    branchId: row.branch_id,
    branchName: branch?.name ?? null,
    color: row.color,
    seats: row.seats,
    fuelType: row.fuel_type as FuelType,
    transmission: row.transmission as Transmission,
    depositMad: row.deposit_amount ? Number(row.deposit_amount) : null,
    insuranceExpiresOn: row.insurance_expires_on,
    registrationExpiresOn: row.registration_expires_on,
    inspectionExpiresOn: row.inspection_expires_on,
    currentReservation: current,
    upcomingReservations: upcoming,
    recentReservations: recent,
  }
}

export interface AvailabilityQuery {
  pickupAt: string
  returnAt: string
  category?: VehicleCategory
  excludeReservationId?: string
}

/** Vehicles that could be assigned to a reservation for the requested
 * window: not under maintenance/unavailable, and not already blocked by
 * an overlapping pending/confirmed/active reservation. See
 * lib/availability.ts for the shared overlap rule this relies on — this
 * is a live-data preview, the EXCLUDE constraint on `reservations` is
 * what actually enforces it at write time. */
export async function getAvailableVehicles(
  companyId: string,
  query: AvailabilityQuery
): Promise<Vehicle[]> {
  const vehicles = await getVehicles(companyId)
  const assignable = vehicles.filter((v) => v.status !== "unavailable" && v.status !== "maintenance")
  const categoryFiltered = query.category
    ? assignable.filter((v) => v.category === query.category)
    : assignable

  let blocking: ExistingReservationWindow[]
  if (isMockMode()) {
    blocking = mockBookings
      .filter((b) => b.vehicle && BLOCKING_RESERVATION_STATUSES.includes(b.status))
      .map((b) => ({
        id: b.id,
        vehicleId: b.vehicle!.id,
        status: b.status,
        startDate: b.startDate,
        endDate: b.endDate,
      }))
  } else {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reservations")
      .select("id, vehicle_id, status, pickup_at, return_at")
      .eq("company_id", companyId)
      .in("status", BLOCKING_RESERVATION_STATUSES)
      .not("vehicle_id", "is", null)

    if (error) throw error
    blocking = (data ?? []).map((r) => ({
      id: r.id,
      vehicleId: r.vehicle_id as string,
      status: r.status as BookingStatus,
      startDate: r.pickup_at,
      endDate: r.return_at,
    }))
  }

  return categoryFiltered.filter((v) =>
    isVehicleAvailable(
      v.id,
      { startDate: query.pickupAt, endDate: query.returnAt },
      blocking,
      query.excludeReservationId
    )
  )
}

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------

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

export async function searchCustomers(
  companyId: string,
  query: string,
  limit = 8
): Promise<Customer[]> {
  const q = query.trim()

  if (isMockMode()) {
    if (!q) return mockCustomers.slice(0, limit)
    const needle = q.toLowerCase()
    return mockCustomers
      .filter((c) => c.fullName.toLowerCase().includes(needle) || c.phone.includes(needle))
      .slice(0, limit)
  }

  const supabase = await createClient()
  let request = supabase
    .from("customers")
    .select("id, full_name, phone, email, license_number, license_expires_on")
    .eq("company_id", companyId)

  if (q) {
    const safe = escapeIlike(q)
    request = request.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
  }

  const { data, error } = await request.order("full_name").limit(limit)
  if (error) throw error
  return (data ?? []).map(mapCustomerRow)
}

export async function findCustomerByPhone(
  companyId: string,
  phone: string
): Promise<Customer | null> {
  const normalized = phone.replace(/\s+/g, "")

  if (isMockMode()) {
    return mockCustomers.find((c) => c.phone.replace(/\s+/g, "") === normalized) ?? null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, license_number, license_expires_on")
    .eq("company_id", companyId)
    .eq("phone", phone)
    .maybeSingle()

  if (error) throw error
  return data ? mapCustomerRow(data) : null
}

// ---------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------

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

export interface ReservationListFilters {
  search?: string
  statuses?: BookingStatus[]
  vehicleId?: string
  customerId?: string
  branchId?: string
  dateFrom?: string
  dateTo?: string
}

export async function getReservationsList(
  companyId: string,
  filters: ReservationListFilters = {},
  page = 1,
  pageSize = 20
): Promise<PaginatedResult<Booking>> {
  if (isMockMode()) {
    let items = [...mockBookings]
    if (filters.statuses?.length) items = items.filter((b) => filters.statuses!.includes(b.status))
    if (filters.vehicleId) items = items.filter((b) => b.vehicle?.id === filters.vehicleId)
    if (filters.customerId) items = items.filter((b) => b.customer.id === filters.customerId)
    if (filters.dateFrom) items = items.filter((b) => b.endDate >= filters.dateFrom!)
    if (filters.dateTo) items = items.filter((b) => b.startDate <= filters.dateTo!)
    if (filters.search) {
      const q = filters.search.toLowerCase()
      items = items.filter((b) =>
        `${b.reference} ${b.customer.fullName} ${b.customer.phone}`.toLowerCase().includes(q)
      )
    }
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const total = items.length
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total, page, pageSize }
  }

  const supabase = await createClient()
  let query = supabase.from("reservations").select(RESERVATION_SELECT, { count: "exact" }).eq("company_id", companyId)

  if (filters.statuses?.length) query = query.in("status", filters.statuses)
  if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId)
  if (filters.customerId) query = query.eq("customer_id", filters.customerId)
  if (filters.branchId) query = query.eq("branch_id", filters.branchId)
  if (filters.dateFrom) query = query.gte("return_at", filters.dateFrom)
  if (filters.dateTo) query = query.lte("pickup_at", filters.dateTo)

  if (filters.search?.trim()) {
    const q = escapeIlike(filters.search)
    const { data: matchingCustomers } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
    const customerIds = (matchingCustomers ?? []).map((c) => c.id)
    const orParts = [`reference.ilike.%${q}%`]
    if (customerIds.length > 0) orParts.push(`customer_id.in.(${customerIds.join(",")})`)
    query = query.or(orParts.join(","))
  }

  const start = (page - 1) * pageSize
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(start, start + pageSize - 1)

  if (error) throw error
  return {
    items: ((data ?? []) as unknown as ReservationJoinRow[]).map(mapReservationRow),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function getReservationDetail(
  companyId: string,
  reservationId: string
): Promise<ReservationDetail | null> {
  if (isMockMode()) {
    const b = mockBookings.find((b) => b.id === reservationId)
    if (!b) return null
    return {
      ...b,
      // Mock bookings only store a date, not a time — default to a
      // plausible pickup/return time for the demo dataset.
      pickupAt: `${b.startDate}T10:00:00+01:00`,
      returnAt: `${b.endDate}T10:00:00+01:00`,
      branchId: mockBranches[0]?.id ?? null,
      branchName: mockBranches[0]?.name ?? null,
      customerDetail: { ...b.customer },
      source: "whatsapp",
      dailyRateMad: b.vehicle ? Math.round(b.payment.totalDueMad / Math.max(1, Math.round((new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) / 86400000))) : 0,
      numDays: Math.max(1, Math.round((new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) / 86400000)),
      discountMad: 0,
      depositMad: null,
      notes: null,
      createdByName: "Youssef El Amrani",
      activity: mockRecentActivity.slice(0, 3),
    }
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("reservations")
    .select(RESERVATION_DETAIL_SELECT)
    .eq("company_id", companyId)
    .eq("id", reservationId)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const base = mapReservationRow(row as unknown as ReservationJoinRow)
  const branch = row.branch as unknown as { id: string; name: string } | null

  let createdByName: string | null = null
  if (row.created_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", row.created_by)
      .maybeSingle()
    createdByName = profile?.full_name ?? null
  }

  const { data: activityRows } = await supabase
    .from("activity_log")
    .select("id, type, title, description, created_at, actor:profiles(full_name)")
    .eq("company_id", companyId)
    .contains("metadata", { reservation_id: reservationId })
    .order("created_at", { ascending: false })
    .limit(20)

  return {
    ...base,
    pickupAt: row.pickup_at,
    returnAt: row.return_at,
    branchId: branch?.id ?? null,
    branchName: branch?.name ?? null,
    customerDetail: {
      ...base.customer,
      email: undefined,
      licenseNumber: undefined,
    },
    source: (row.source as ReservationDetail["source"]) ?? "other",
    dailyRateMad: Number(row.daily_rate),
    numDays: row.num_days,
    discountMad: Number(row.discount_amount ?? 0),
    depositMad: row.deposit_amount ? Number(row.deposit_amount) : null,
    notes: row.notes,
    createdByName,
    activity: (activityRows ?? []).map((r) => mapActivityRow(r as never)),
  }
}

export interface CalendarQuery {
  startDate: string
  endDate: string
  branchId?: string
}

export async function getCalendarReservations(
  companyId: string,
  query: CalendarQuery
): Promise<Booking[]> {
  if (isMockMode()) {
    return mockBookings.filter(
      (b) =>
        b.status !== "cancelled" &&
        b.status !== "no_show" &&
        periodsOverlap(b.startDate, b.endDate, query.startDate, query.endDate)
    )
  }

  const supabase = await createClient()
  let request = supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("company_id", companyId)
    .not("status", "in", "(cancelled,no_show)")
    .lt("pickup_at", query.endDate)
    .gt("return_at", query.startDate)

  if (query.branchId) request = request.eq("branch_id", query.branchId)

  const { data, error } = await request.order("pickup_at")
  if (error) throw error
  return ((data ?? []) as unknown as ReservationJoinRow[]).map(mapReservationRow)
}

export interface MaintenanceBlock {
  id: string
  vehicleId: string
  vehicleLabel: string
  date: string
  title: string
}

export async function getCalendarMaintenanceBlocks(
  companyId: string,
  query: CalendarQuery
): Promise<MaintenanceBlock[]> {
  if (isMockMode()) {
    return mockMaintenanceAlerts
      .filter((a) => a.dueDate >= query.startDate && a.dueDate <= query.endDate)
      .map((a) => ({
        id: a.id,
        vehicleId: a.vehicle.id,
        vehicleLabel: `${a.vehicle.make} ${a.vehicle.model}`,
        date: a.dueDate,
        title: a.title,
      }))
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("maintenance_records")
    .select("id, type, scheduled_on, vehicle:vehicles(id, make, model)")
    .eq("company_id", companyId)
    .in("status", ["scheduled", "in_progress"])
    .gte("scheduled_on", query.startDate)
    .lte("scheduled_on", query.endDate)

  if (error) throw error
  return (data ?? [])
    .filter((r) => r.scheduled_on && r.vehicle)
    .map((r) => {
      const v = r.vehicle as unknown as { id: string; make: string; model: string }
      return {
        id: r.id,
        vehicleId: v.id,
        vehicleLabel: `${v.make} ${v.model}`,
        date: r.scheduled_on as string,
        title: maintenanceTitle(r.type),
      }
    })
}

// ---------------------------------------------------------------------
// Maintenance & activity (Overview)
// ---------------------------------------------------------------------

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
