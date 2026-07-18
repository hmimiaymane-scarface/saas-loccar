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
import { checklistTemplate as mockChecklistTemplate } from "@/lib/mock/checklist"
import { inspections as mockInspections } from "@/lib/mock/inspections"
import { damages as mockDamages } from "@/lib/mock/damages"
import { deposits as mockDeposits } from "@/lib/mock/deposits"
import { documents as mockDocuments } from "@/lib/mock/documents"
import { paymentLedger as mockPaymentLedger } from "@/lib/mock/payment-ledger"
import {
  BLOCKING_RESERVATION_STATUSES,
  isVehicleAvailable,
  periodsOverlap,
  type ExistingReservationWindow,
} from "@/lib/availability"
import { STORAGE_BUCKET } from "@/lib/storage"
import { depositHeldMad } from "@/lib/deposits"
import type {
  Booking,
  BookingStatus,
  Branch,
  ChecklistCategory,
  ChecklistItemResponse,
  ChecklistResponseValue,
  ChecklistTemplateItem,
  Cleanliness,
  CustomerDetail,
  Damage,
  DamageCategory,
  DamageSeverity,
  DamageStatus,
  Deposit,
  DepositStatus,
  DocumentCategory,
  FuelLevel,
  FuelType,
  Inspection,
  InspectionStatus,
  InspectionType,
  MaintenanceAlert,
  MaintenanceSeverity,
  MediaFile,
  OverallCondition,
  OverviewMetrics,
  PaymentDirection,
  PaymentMethod,
  PaymentTransaction,
  PaymentTransactionType,
  RentalDocument,
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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Batches a set of user ids into a single `profiles` query instead of one
 * round trip per row — the standard fix for the N+1 pattern that "actor
 * name" / "recorded by" / "performed by" fields would otherwise cause. */
async function resolveProfileNames(
  supabase: SupabaseServerClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase.from("profiles").select("id, full_name").in("id", uniqueIds)
  const map = new Map<string, string>()
  for (const p of data ?? []) {
    if (p.full_name) map.set(p.id, p.full_name)
  }
  return map
}

/** Batches signed-URL generation for a set of storage paths. Never expose
 * a raw storage path to the client — every document/photo the UI shows a
 * link for goes through this first. */
async function resolveSignedUrls(
  supabase: SupabaseServerClient,
  paths: string[]
): Promise<Map<string, string>> {
  const uniquePaths = Array.from(new Set(paths))
  if (uniquePaths.length === 0) return new Map()

  const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(uniquePaths, 3600)
  const map = new Map<string, string>()
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

function mapDamageRow(row: {
  id: string
  vehicle_id: string
  reservation_id: string | null
  discovered_in_inspection_id: string | null
  status: string
  category: string
  vehicle_area: string
  severity: string
  description: string
  pre_existing: boolean
  estimated_cost: string | null
  actual_cost: string | null
  created_by: string | null
  created_at: string
  vehicle: { make: string; model: string } | null
  reservation: { reference: string } | null
}): Omit<Damage, "createdByName"> & { createdBy: string | null } {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleLabel: row.vehicle ? `${row.vehicle.make} ${row.vehicle.model}` : "",
    reservationId: row.reservation_id,
    reservationReference: row.reservation?.reference ?? null,
    discoveredInInspectionId: row.discovered_in_inspection_id,
    status: row.status as DamageStatus,
    category: row.category as DamageCategory,
    vehicleArea: row.vehicle_area,
    severity: row.severity as DamageSeverity,
    description: row.description,
    preExisting: row.pre_existing,
    estimatedCostMad: row.estimated_cost ? Number(row.estimated_cost) : null,
    actualCostMad: row.actual_cost ? Number(row.actual_cost) : null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    media: [],
  }
}

function mapDepositRow(row: {
  id: string
  reservation_id: string
  status: string
  expected_amount: string
  collected_amount: string
  returned_amount: string
  retained_amount: string
  method: string | null
  collected_at: string | null
  returned_at: string | null
  notes: string | null
}): Deposit {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    status: row.status as DepositStatus,
    expectedMad: Number(row.expected_amount),
    collectedMad: Number(row.collected_amount),
    returnedMad: Number(row.returned_amount),
    retainedMad: Number(row.retained_amount),
    method: (row.method as PaymentMethod) ?? null,
    collectedAt: row.collected_at,
    returnedAt: row.returned_at,
    notes: row.notes,
  }
}

function mapDocumentRow(row: {
  id: string
  category: string
  storage_path: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  contract_reference: string | null
  notes: string | null
  status: string
  uploaded_by: string | null
  created_at: string
  reservation_id: string | null
  customer_id: string | null
  vehicle_id: string | null
}): Omit<RentalDocument, "uploadedByName" | "url"> & { uploadedBy: string | null; storagePath: string } {
  return {
    id: row.id,
    category: row.category as DocumentCategory,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    contractReference: row.contract_reference,
    notes: row.notes,
    status: row.status as RentalDocument["status"],
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    reservationId: row.reservation_id,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id,
    storagePath: row.storage_path,
  }
}

function mapPaymentRow(row: {
  id: string
  reservation_id: string | null
  customer_id: string
  transaction_type: string
  direction: string
  amount: string
  method: string
  paid_at: string
  reference: string | null
  notes: string | null
  recorded_by: string | null
  customer: { full_name: string } | null
  reservation: { reference: string } | null
}): Omit<PaymentTransaction, "recordedByName"> & { recordedBy: string | null } {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    reservationReference: row.reservation?.reference ?? null,
    customerId: row.customer_id,
    customerName: row.customer?.full_name ?? "Unknown customer",
    transactionType: row.transaction_type as PaymentTransactionType,
    direction: row.direction as PaymentDirection,
    amountMad: Number(row.amount),
    method: row.method as PaymentMethod,
    paidAt: row.paid_at,
    reference: row.reference,
    notes: row.notes,
    recordedBy: row.recorded_by,
  }
}

const CHECKLIST_RESPONSE_SELECT = "id, item_key, item_label, category, response, notes"

function mapChecklistResponseRow(row: {
  id: string
  item_key: string
  item_label: string
  category: string
  response: string
  notes: string | null
}): ChecklistItemResponse {
  return {
    id: row.id,
    itemKey: row.item_key,
    itemLabel: row.item_label,
    category: row.category as ChecklistCategory,
    response: row.response as ChecklistResponseValue,
    notes: row.notes,
  }
}

function mapMediaRow(row: {
  id: string
  entity_type: string
  entity_id: string
  original_filename: string
  mime_type: string
  caption: string | null
  created_at: string
  storage_path: string
}): Omit<MediaFile, "url"> & { storagePath: string } {
  return {
    id: row.id,
    entityType: row.entity_type as MediaFile["entityType"],
    entityId: row.entity_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    caption: row.caption,
    createdAt: row.created_at,
    storagePath: row.storage_path,
  }
}

const RESERVATION_SELECT =
  "id, reference, pickup_at, return_at, pickup_location, return_location, status, total_amount, amount_paid, remaining_balance, requested_category, created_at, customer:customers(id, full_name, phone), vehicle:vehicles(id, make, model, registration_number, category)"

const RESERVATION_DETAIL_SELECT =
  "id, reference, pickup_at, return_at, pickup_location, return_location, status, source, daily_rate, num_days, discount_amount, total_amount, amount_paid, remaining_balance, notes, requested_category, created_at, created_by, branch:branches(id, name), customer:customers(id, full_name, phone, email, license_number), vehicle:vehicles(id, make, model, registration_number, category)"

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

    const vehicleDamages = mockDamages.filter((d) => d.vehicleId === vehicleId)

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
      openDamages: vehicleDamages.filter((d) => !["repaired", "closed"].includes(d.status)),
      previousDamages: vehicleDamages.filter((d) => ["repaired", "closed"].includes(d.status)),
      recentInspections: mockInspections.filter((i) => i.vehicleId === vehicleId).slice(0, 5),
      documents: mockDocuments.filter((d) => d.vehicleId === vehicleId),
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

  const [damageRows, inspectionRows, documentRows] = await Promise.all([
    supabase
      .from("damages")
      .select("id, vehicle_id, reservation_id, discovered_in_inspection_id, status, category, vehicle_area, severity, description, pre_existing, estimated_cost, actual_cost, created_by, created_at, vehicle:vehicles(make, model), reservation:reservations(reference)")
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false }),
    supabase
      .from("inspections")
      .select("id, reservation_id, vehicle_id, customer_id, type, status, performed_by, odometer_km, fuel_level, cleanliness, overall_condition, notes, customer_acknowledged, completed_at, correction_reason, corrected_at, created_at")
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id, category, storage_path, original_filename, mime_type, file_size_bytes, contract_reference, notes, status, uploaded_by, created_at, reservation_id, customer_id, vehicle_id")
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ])

  if (damageRows.error) throw damageRows.error
  if (inspectionRows.error) throw inspectionRows.error
  if (documentRows.error) throw documentRows.error

  const mappedDamages = (damageRows.data ?? []).map((r) => mapDamageRow(r as never))
  const mappedDocuments = (documentRows.data ?? []).map((r) => mapDocumentRow(r as never))

  const nameMap = await resolveProfileNames(supabase, [
    ...mappedDamages.map((d) => d.createdBy),
    ...mappedDocuments.map((d) => d.uploadedBy),
  ])
  const urlMap = await resolveSignedUrls(supabase, mappedDocuments.map((d) => d.storagePath))

  const damagesWithNames = mappedDamages.map((d) => ({
    ...d,
    createdByName: d.createdBy ? nameMap.get(d.createdBy) ?? null : null,
  }))
  const documentsWithUrls = mappedDocuments.map((d) => ({
    ...d,
    uploadedByName: d.uploadedBy ? nameMap.get(d.uploadedBy) ?? null : null,
    url: urlMap.get(d.storagePath) ?? null,
  }))
  const inspectionsMapped: Inspection[] = (inspectionRows.data ?? []).map((r) => ({
    id: r.id,
    reservationId: r.reservation_id,
    vehicleId: r.vehicle_id,
    customerId: r.customer_id,
    type: r.type as InspectionType,
    status: r.status as InspectionStatus,
    performedByName: null,
    odometerKm: r.odometer_km,
    fuelLevel: r.fuel_level as FuelLevel | null,
    cleanliness: r.cleanliness as Cleanliness | null,
    overallCondition: r.overall_condition as OverallCondition | null,
    notes: r.notes,
    customerAcknowledged: r.customer_acknowledged,
    completedAt: r.completed_at,
    correctionReason: r.correction_reason,
    correctedAt: r.corrected_at,
    createdAt: r.created_at,
    checklist: [],
    media: [],
  }))

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
    openDamages: damagesWithNames.filter((d) => !["repaired", "closed"].includes(d.status)),
    previousDamages: damagesWithNames.filter((d) => ["repaired", "closed"].includes(d.status)),
    recentInspections: inspectionsMapped,
    documents: documentsWithUrls,
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
      notes: null,
      createdByName: "Youssef El Amrani",
      activity: mockRecentActivity.slice(0, 3),
      deposit: mockDeposits.find((d) => d.reservationId === reservationId) ?? null,
      pickupInspection: mockInspections.find((i) => i.reservationId === reservationId && i.type === "pickup") ?? null,
      returnInspection: mockInspections.find((i) => i.reservationId === reservationId && i.type === "return") ?? null,
      documents: mockDocuments.filter((d) => d.reservationId === reservationId),
      damages: mockDamages.filter((d) => d.reservationId === reservationId),
      payments: mockPaymentLedger.filter((p) => p.reservationId === reservationId),
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

  const [activityResult, depositResult, inspectionResult, documentResult, damageResult, paymentResult] =
    await Promise.all([
      supabase
        .from("activity_log")
        .select("id, type, title, description, created_at, actor:profiles(full_name)")
        .eq("company_id", companyId)
        .contains("metadata", { reservation_id: reservationId })
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("deposits").select("*").eq("company_id", companyId).eq("reservation_id", reservationId).maybeSingle(),
      supabase
        .from("inspections")
        .select("id, reservation_id, vehicle_id, customer_id, type, status, performed_by, odometer_km, fuel_level, cleanliness, overall_condition, notes, customer_acknowledged, completed_at, correction_reason, corrected_at, created_at")
        .eq("company_id", companyId)
        .eq("reservation_id", reservationId),
      supabase
        .from("documents")
        .select("id, category, storage_path, original_filename, mime_type, file_size_bytes, contract_reference, notes, status, uploaded_by, created_at, reservation_id, customer_id, vehicle_id")
        .eq("company_id", companyId)
        .eq("reservation_id", reservationId)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      supabase
        .from("damages")
        .select("id, vehicle_id, reservation_id, discovered_in_inspection_id, status, category, vehicle_area, severity, description, pre_existing, estimated_cost, actual_cost, created_by, created_at, vehicle:vehicles(make, model), reservation:reservations(reference)")
        .eq("company_id", companyId)
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select("id, reservation_id, customer_id, transaction_type, direction, amount, method, paid_at, reference, notes, recorded_by, customer:customers(full_name), reservation:reservations(reference)")
        .eq("company_id", companyId)
        .eq("reservation_id", reservationId)
        .order("paid_at", { ascending: false }),
    ])

  const mappedDocuments = (documentResult.data ?? []).map((r) => mapDocumentRow(r as never))
  const mappedDamages = (damageResult.data ?? []).map((r) => mapDamageRow(r as never))
  const mappedPayments = (paymentResult.data ?? []).map((r) => mapPaymentRow(r as never))

  const nameMap = await resolveProfileNames(supabase, [
    ...mappedDocuments.map((d) => d.uploadedBy),
    ...mappedDamages.map((d) => d.createdBy),
    ...mappedPayments.map((p) => p.recordedBy),
    ...(inspectionResult.data ?? []).map((i) => i.performed_by),
  ])
  const urlMap = await resolveSignedUrls(supabase, mappedDocuments.map((d) => d.storagePath))

  const documentsWithUrls = mappedDocuments.map((d) => ({
    ...d,
    uploadedByName: d.uploadedBy ? nameMap.get(d.uploadedBy) ?? null : null,
    url: urlMap.get(d.storagePath) ?? null,
  }))
  const damagesWithNames = mappedDamages.map((d) => ({
    ...d,
    createdByName: d.createdBy ? nameMap.get(d.createdBy) ?? null : null,
  }))
  const paymentsWithNames = mappedPayments.map((p) => ({
    ...p,
    recordedByName: p.recordedBy ? nameMap.get(p.recordedBy) ?? null : null,
  }))

  const inspectionsMapped: Inspection[] = (inspectionResult.data ?? []).map((r) => ({
    id: r.id,
    reservationId: r.reservation_id,
    vehicleId: r.vehicle_id,
    customerId: r.customer_id,
    type: r.type as InspectionType,
    status: r.status as InspectionStatus,
    performedByName: r.performed_by ? nameMap.get(r.performed_by) ?? null : null,
    odometerKm: r.odometer_km,
    fuelLevel: r.fuel_level as FuelLevel | null,
    cleanliness: r.cleanliness as Cleanliness | null,
    overallCondition: r.overall_condition as OverallCondition | null,
    notes: r.notes,
    customerAcknowledged: r.customer_acknowledged,
    completedAt: r.completed_at,
    correctionReason: r.correction_reason,
    correctedAt: r.corrected_at,
    createdAt: r.created_at,
    checklist: [],
    media: [],
  }))

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
    notes: row.notes,
    createdByName,
    activity: (activityResult.data ?? []).map((r) => mapActivityRow(r as never)),
    deposit: depositResult.data ? mapDepositRow(depositResult.data) : null,
    pickupInspection: inspectionsMapped.find((i) => i.type === "pickup") ?? null,
    returnInspection: inspectionsMapped.find((i) => i.type === "return") ?? null,
    documents: documentsWithUrls,
    damages: damagesWithNames,
    payments: paymentsWithNames,
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
    // Only `rental_payment` counts as revenue — deposits, refunds and
    // charges are tracked separately (see docs/security.md /
    // supabase/migrations/20260719090600_payments_ledger.sql) and must
    // never inflate this number.
    supabase
      .from("payments")
      .select("amount")
      .eq("company_id", companyId)
      .eq("transaction_type", "rental_payment")
      .gte("paid_at", todayStartIso)
      .lt("paid_at", todayEndIso),
    supabase
      .from("payments")
      .select("amount")
      .eq("company_id", companyId)
      .eq("transaction_type", "rental_payment")
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

// ---------------------------------------------------------------------
// Checklist template
// ---------------------------------------------------------------------

export async function getChecklistTemplate(companyId: string): Promise<ChecklistTemplateItem[]> {
  if (isMockMode()) return mockChecklistTemplate

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("checklist_template_items")
    .select("id, key, label, category, sort_order")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order")

  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    category: r.category as ChecklistCategory,
    sortOrder: r.sort_order,
  }))
}

// ---------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------

const INSPECTION_SELECT =
  "id, reservation_id, vehicle_id, customer_id, type, status, performed_by, odometer_km, fuel_level, cleanliness, overall_condition, notes, customer_acknowledged, completed_at, correction_reason, corrected_at, created_at"

export async function getInspectionDetail(
  companyId: string,
  inspectionId: string
): Promise<Inspection | null> {
  if (isMockMode()) {
    return mockInspections.find((i) => i.id === inspectionId) ?? null
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("inspections")
    .select(INSPECTION_SELECT)
    .eq("company_id", companyId)
    .eq("id", inspectionId)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const [{ data: checklistRows }, { data: mediaRows }] = await Promise.all([
    supabase
      .from("inspection_checklist_responses")
      .select(CHECKLIST_RESPONSE_SELECT)
      .eq("company_id", companyId)
      .eq("inspection_id", inspectionId)
      .order("created_at"),
    supabase
      .from("media")
      .select("id, entity_type, entity_id, original_filename, mime_type, caption, created_at, storage_path")
      .eq("company_id", companyId)
      .eq("entity_type", "inspection")
      .eq("entity_id", inspectionId)
      .order("created_at"),
  ])

  const mappedMedia = (mediaRows ?? []).map((r) => mapMediaRow(r as never))
  const nameMap = await resolveProfileNames(supabase, [row.performed_by])
  const urlMap = await resolveSignedUrls(supabase, mappedMedia.map((m) => m.storagePath))

  return {
    id: row.id,
    reservationId: row.reservation_id,
    vehicleId: row.vehicle_id,
    customerId: row.customer_id,
    type: row.type as InspectionType,
    status: row.status as InspectionStatus,
    performedByName: row.performed_by ? nameMap.get(row.performed_by) ?? null : null,
    odometerKm: row.odometer_km,
    fuelLevel: row.fuel_level as FuelLevel | null,
    cleanliness: row.cleanliness as Cleanliness | null,
    overallCondition: row.overall_condition as OverallCondition | null,
    notes: row.notes,
    customerAcknowledged: row.customer_acknowledged,
    completedAt: row.completed_at,
    correctionReason: row.correction_reason,
    correctedAt: row.corrected_at,
    createdAt: row.created_at,
    checklist: (checklistRows ?? []).map(mapChecklistResponseRow),
    media: mappedMedia.map((m) => ({ ...m, url: urlMap.get(m.storagePath) ?? null })),
  }
}

/** Both inspections for a reservation in one call — used by the
 * pickup/return workflow and the comparison page. At most 2 rows per
 * reservation, so the per-id getInspectionDetail() fan-out here isn't a
 * real N+1 concern. */
export async function getInspectionsForReservation(
  companyId: string,
  reservationId: string
): Promise<{ pickup: Inspection | null; return: Inspection | null }> {
  if (isMockMode()) {
    return {
      pickup: mockInspections.find((i) => i.reservationId === reservationId && i.type === "pickup") ?? null,
      return: mockInspections.find((i) => i.reservationId === reservationId && i.type === "return") ?? null,
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("inspections")
    .select("id, type")
    .eq("company_id", companyId)
    .eq("reservation_id", reservationId)

  if (error) throw error
  const pickupId = (data ?? []).find((r) => r.type === "pickup")?.id
  const returnId = (data ?? []).find((r) => r.type === "return")?.id

  const [pickup, returnInsp] = await Promise.all([
    pickupId ? getInspectionDetail(companyId, pickupId) : Promise.resolve(null),
    returnId ? getInspectionDetail(companyId, returnId) : Promise.resolve(null),
  ])

  return { pickup, return: returnInsp }
}

// ---------------------------------------------------------------------
// Damages
// ---------------------------------------------------------------------

const DAMAGE_SELECT =
  "id, vehicle_id, reservation_id, discovered_in_inspection_id, status, category, vehicle_area, severity, description, pre_existing, estimated_cost, actual_cost, created_by, created_at, vehicle:vehicles(make, model), reservation:reservations(reference)"

export interface DamageListFilters {
  vehicleId?: string
  status?: DamageStatus
}

export async function getDamagesList(
  companyId: string,
  filters: DamageListFilters = {}
): Promise<Damage[]> {
  if (isMockMode()) {
    let items = [...mockDamages]
    if (filters.vehicleId) items = items.filter((d) => d.vehicleId === filters.vehicleId)
    if (filters.status) items = items.filter((d) => d.status === filters.status)
    return items
  }

  const supabase = await createClient()
  let query = supabase.from("damages").select(DAMAGE_SELECT).eq("company_id", companyId)
  if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId)
  if (filters.status) query = query.eq("status", filters.status)

  const { data, error } = await query.order("created_at", { ascending: false })
  if (error) throw error

  const mapped = (data ?? []).map((r) => mapDamageRow(r as never))
  const nameMap = await resolveProfileNames(supabase, mapped.map((d) => d.createdBy))
  return mapped.map((d) => ({ ...d, createdByName: d.createdBy ? nameMap.get(d.createdBy) ?? null : null }))
}

export async function getDamageDetail(companyId: string, damageId: string): Promise<Damage | null> {
  if (isMockMode()) {
    return mockDamages.find((d) => d.id === damageId) ?? null
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("damages")
    .select(DAMAGE_SELECT)
    .eq("company_id", companyId)
    .eq("id", damageId)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const { data: mediaRows } = await supabase
    .from("media")
    .select("id, entity_type, entity_id, original_filename, mime_type, caption, created_at, storage_path")
    .eq("company_id", companyId)
    .eq("entity_type", "damage")
    .eq("entity_id", damageId)
    .order("created_at")

  const mappedMedia = (mediaRows ?? []).map((r) => mapMediaRow(r as never))
  const mapped = mapDamageRow(row as never)
  const nameMap = await resolveProfileNames(supabase, [mapped.createdBy])
  const urlMap = await resolveSignedUrls(supabase, mappedMedia.map((m) => m.storagePath))

  return {
    ...mapped,
    createdByName: mapped.createdBy ? nameMap.get(mapped.createdBy) ?? null : null,
    media: mappedMedia.map((m) => ({ ...m, url: urlMap.get(m.storagePath) ?? null })),
  }
}

// ---------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------

export async function getDepositForReservation(
  companyId: string,
  reservationId: string
): Promise<Deposit | null> {
  if (isMockMode()) {
    return mockDeposits.find((d) => d.reservationId === reservationId) ?? null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("deposits")
    .select("*")
    .eq("company_id", companyId)
    .eq("reservation_id", reservationId)
    .maybeSingle()

  if (error) throw error
  return data ? mapDepositRow(data) : null
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

const DOCUMENT_SELECT =
  "id, category, storage_path, original_filename, mime_type, file_size_bytes, contract_reference, notes, status, uploaded_by, created_at, reservation_id, customer_id, vehicle_id"

export interface DocumentListFilters {
  category?: DocumentCategory
  reservationId?: string
  customerId?: string
  vehicleId?: string
  search?: string
}

export async function getDocumentsList(
  companyId: string,
  filters: DocumentListFilters = {},
  page = 1,
  pageSize = 24
): Promise<PaginatedResult<RentalDocument>> {
  if (isMockMode()) {
    let items = mockDocuments.filter((d) => d.status === "active")
    if (filters.category) items = items.filter((d) => d.category === filters.category)
    if (filters.reservationId) items = items.filter((d) => d.reservationId === filters.reservationId)
    if (filters.customerId) items = items.filter((d) => d.customerId === filters.customerId)
    if (filters.vehicleId) items = items.filter((d) => d.vehicleId === filters.vehicleId)
    if (filters.search) {
      const q = filters.search.toLowerCase()
      items = items.filter((d) => d.originalFilename.toLowerCase().includes(q))
    }
    const total = items.length
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total, page, pageSize }
  }

  const supabase = await createClient()
  let query = supabase
    .from("documents")
    .select(DOCUMENT_SELECT, { count: "exact" })
    .eq("company_id", companyId)
    .eq("status", "active")

  if (filters.category) query = query.eq("category", filters.category)
  if (filters.reservationId) query = query.eq("reservation_id", filters.reservationId)
  if (filters.customerId) query = query.eq("customer_id", filters.customerId)
  if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId)
  if (filters.search) query = query.ilike("original_filename", `%${escapeIlike(filters.search)}%`)

  const start = (page - 1) * pageSize
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(start, start + pageSize - 1)

  if (error) throw error

  const mapped = (data ?? []).map((r) => mapDocumentRow(r as never))
  const nameMap = await resolveProfileNames(supabase, mapped.map((d) => d.uploadedBy))
  const urlMap = await resolveSignedUrls(supabase, mapped.map((d) => d.storagePath))

  return {
    items: mapped.map((d) => ({
      ...d,
      uploadedByName: d.uploadedBy ? nameMap.get(d.uploadedBy) ?? null : null,
      url: urlMap.get(d.storagePath) ?? null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
}

// ---------------------------------------------------------------------
// Payments ledger
// ---------------------------------------------------------------------

const PAYMENT_SELECT =
  "id, reservation_id, customer_id, transaction_type, direction, amount, method, paid_at, reference, notes, recorded_by, customer:customers(full_name), reservation:reservations(reference)"

export interface PaymentListFilters {
  transactionType?: PaymentTransactionType
  method?: PaymentMethod
  reservationId?: string
  customerId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export async function getPaymentsLedger(
  companyId: string,
  filters: PaymentListFilters = {},
  page = 1,
  pageSize = 25
): Promise<PaginatedResult<PaymentTransaction>> {
  if (isMockMode()) {
    let items = [...mockPaymentLedger]
    if (filters.transactionType) items = items.filter((p) => p.transactionType === filters.transactionType)
    if (filters.method) items = items.filter((p) => p.method === filters.method)
    if (filters.reservationId) items = items.filter((p) => p.reservationId === filters.reservationId)
    if (filters.customerId) items = items.filter((p) => p.customerId === filters.customerId)
    if (filters.dateFrom) items = items.filter((p) => p.paidAt >= filters.dateFrom!)
    if (filters.dateTo) items = items.filter((p) => p.paidAt <= filters.dateTo!)
    if (filters.search) {
      const q = filters.search.toLowerCase()
      items = items.filter(
        (p) =>
          p.customerName.toLowerCase().includes(q) ||
          (p.reservationReference ?? "").toLowerCase().includes(q)
      )
    }
    items.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    const total = items.length
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total, page, pageSize }
  }

  const supabase = await createClient()
  let query = supabase.from("payments").select(PAYMENT_SELECT, { count: "exact" }).eq("company_id", companyId)

  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType)
  if (filters.method) query = query.eq("method", filters.method)
  if (filters.reservationId) query = query.eq("reservation_id", filters.reservationId)
  if (filters.customerId) query = query.eq("customer_id", filters.customerId)
  if (filters.dateFrom) query = query.gte("paid_at", filters.dateFrom)
  if (filters.dateTo) query = query.lte("paid_at", filters.dateTo)

  if (filters.search?.trim()) {
    const q = escapeIlike(filters.search)
    const { data: matchingCustomers } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .ilike("full_name", `%${q}%`)
    const customerIds = (matchingCustomers ?? []).map((c) => c.id)
    if (customerIds.length > 0) query = query.in("customer_id", customerIds)
  }

  const start = (page - 1) * pageSize
  const { data, error, count } = await query
    .order("paid_at", { ascending: false })
    .range(start, start + pageSize - 1)

  if (error) throw error

  const mapped = (data ?? []).map((r) => mapPaymentRow(r as never))
  const nameMap = await resolveProfileNames(supabase, mapped.map((p) => p.recordedBy))

  return {
    items: mapped.map((p) => ({ ...p, recordedByName: p.recordedBy ? nameMap.get(p.recordedBy) ?? null : null })),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export interface PaymentsSummary {
  revenueTodayMad: number
  revenueThisMonthMad: number
  outstandingBalanceMad: number
  depositsHeldMad: number
  unresolvedDamageChargesMad: number
}

export async function getPaymentsSummary(companyId: string): Promise<PaymentsSummary> {
  const metrics = await getOverviewMetrics(companyId)

  if (isMockMode()) {
    const depositsHeldMad = mockDeposits.reduce((sum, d) => sum + depositHeldMad(d), 0)
    return {
      revenueTodayMad: metrics.revenueTodayMad,
      revenueThisMonthMad: metrics.revenueThisMonthMad,
      outstandingBalanceMad: metrics.outstandingBalanceMad,
      depositsHeldMad,
      unresolvedDamageChargesMad: mockDamages
        .filter((d) => !["repaired", "closed"].includes(d.status))
        .reduce((sum, d) => sum + (d.estimatedCostMad ?? 0), 0),
    }
  }

  const supabase = await createClient()
  const [depositRows, damageRows] = await Promise.all([
    supabase
      .from("deposits")
      .select("collected_amount, returned_amount, retained_amount")
      .eq("company_id", companyId),
    supabase
      .from("damages")
      .select("estimated_cost, status")
      .eq("company_id", companyId)
      .not("status", "in", "(repaired,closed)"),
  ])

  if (depositRows.error) throw depositRows.error
  if (damageRows.error) throw damageRows.error

  const depositsHeldMad = (depositRows.data ?? []).reduce(
    (sum, d) =>
      sum +
      depositHeldMad({
        collectedMad: Number(d.collected_amount),
        returnedMad: Number(d.returned_amount),
        retainedMad: Number(d.retained_amount),
      }),
    0
  )
  const unresolvedDamageChargesMad = (damageRows.data ?? []).reduce(
    (sum, d) => sum + (d.estimated_cost ? Number(d.estimated_cost) : 0),
    0
  )

  return {
    revenueTodayMad: metrics.revenueTodayMad,
    revenueThisMonthMad: metrics.revenueThisMonthMad,
    outstandingBalanceMad: metrics.outstandingBalanceMad,
    depositsHeldMad,
    unresolvedDamageChargesMad,
  }
}

// ---------------------------------------------------------------------
// Customer detail
// ---------------------------------------------------------------------

export async function getCustomerDetail(companyId: string, customerId: string): Promise<CustomerDetail | null> {
  if (isMockMode()) {
    const c = mockCustomers.find((c) => c.id === customerId)
    if (!c) return null
    const custReservations = mockBookings.filter((b) => b.customer.id === customerId)
    const activeRental = custReservations.find((b) => b.status === "active") ?? null
    const outstandingBalanceMad = custReservations
      .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
      .reduce((sum, b) => sum + b.payment.remainingMad, 0)
    return {
      ...c,
      nationality: null,
      idDocumentNumber: null,
      address: null,
      notes: null,
      status: "active",
      reservations: custReservations,
      activeRental,
      documents: mockDocuments.filter((d) => d.customerId === customerId),
      outstandingBalanceMad,
    }
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("customers")
    .select(
      "id, full_name, phone, email, nationality, id_document_number, license_number, license_expires_on, address, notes, status"
    )
    .eq("company_id", companyId)
    .eq("id", customerId)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const [reservationResult, documentResult] = await Promise.all([
    supabase
      .from("reservations")
      .select(RESERVATION_SELECT)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ])

  if (reservationResult.error) throw reservationResult.error
  if (documentResult.error) throw documentResult.error

  const custReservations = ((reservationResult.data ?? []) as unknown as ReservationJoinRow[]).map(mapReservationRow)
  const activeRental = custReservations.find((b) => b.status === "active") ?? null
  const outstandingBalanceMad = custReservations
    .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
    .reduce((sum, b) => sum + b.payment.remainingMad, 0)

  const mappedDocuments = (documentResult.data ?? []).map((r) => mapDocumentRow(r as never))
  const nameMap = await resolveProfileNames(supabase, mappedDocuments.map((d) => d.uploadedBy))
  const urlMap = await resolveSignedUrls(supabase, mappedDocuments.map((d) => d.storagePath))

  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? undefined,
    licenseNumber: row.license_number ?? "",
    licenseExpiresAt: row.license_expires_on ?? "",
    totalBookings: custReservations.length,
    nationality: row.nationality,
    idDocumentNumber: row.id_document_number,
    address: row.address,
    notes: row.notes,
    status: row.status as CustomerDetail["status"],
    reservations: custReservations,
    activeRental,
    documents: mappedDocuments.map((d) => ({
      ...d,
      uploadedByName: d.uploadedBy ? nameMap.get(d.uploadedBy) ?? null : null,
      url: urlMap.get(d.storagePath) ?? null,
    })),
    outstandingBalanceMad,
  }
}
