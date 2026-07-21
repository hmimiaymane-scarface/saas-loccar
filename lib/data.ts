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
import { maintenanceRecords as mockMaintenanceRecords } from "@/lib/mock/maintenance-records"
import { expenses as mockExpenses } from "@/lib/mock/expenses"
import { teamMembers as mockTeamMembers, pendingInvitations as mockPendingInvitations } from "@/lib/mock/team"
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
import { urgencyForDaysUntil, daysUntil as daysUntilFn } from "@/lib/alerts"
import {
  findDuplicateMatches,
  type CustomerMatchCandidate,
  type DuplicateMatch,
} from "@/lib/customer-matching"
import { searchDocumentIdsByExtractedFields } from "@/lib/documents"
import { MAINTENANCE_TYPE_LABELS } from "@/lib/status"
import {
  rentalDaysFor,
  occupancyRate as occupancyRateFn,
  downtimeDays as downtimeDaysFn,
  knownOperatingResult,
  isReturningCustomer,
  type ReportDateRange,
} from "@/lib/reports"
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
  MaintenanceRecord,
  MaintenancePriority,
  MaintenanceRecordStatus,
  MaintenanceType,
  ReservationConflict,
  Expense,
  ExpenseCategory,
  LiveAlert,
  NotificationItem,
  NotificationType,
  FinancialReport,
  FleetPerformanceReport,
  FleetPerformanceRow,
  ReservationPerformanceReport,
  CustomerOverviewReport,
  VehicleEconomics,
  ReservationSource,
  TeamMember,
  TeamInvitation,
  EmployeeRole,
  ActivityType,
  MediaFile,
  OverallCondition,
  OverviewMetrics,
  TodayTimelineEntry,
  FleetOverviewVehicle,
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
function mapActivityRow(row: {
  id: string
  type: string
  title: string
  description: string | null
  created_at: string
  actor_id?: string | null
  metadata?: Record<string, unknown> | null
  actor: { full_name: string | null } | null
}): ActivityItem {
  const metadata = row.metadata ?? {}
  return {
    id: row.id,
    type: row.type as ActivityItem["type"],
    title: row.title,
    description: row.description ?? row.title,
    timestamp: row.created_at,
    actor: row.actor?.full_name ?? undefined,
    actorId: row.actor_id ?? undefined,
    reservationId: typeof metadata.reservation_id === "string" ? metadata.reservation_id : undefined,
    vehicleId: typeof metadata.vehicle_id === "string" ? metadata.vehicle_id : undefined,
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

/** Identity-based duplicate detection (roadmap phase 04 requirement 5)
 * — a softer, confidence-scored complement to findCustomerByPhone's
 * exact match. Scores the candidate's name/id-document/licence-number
 * against every customer in the company; see lib/customer-matching.ts
 * for the scoring itself and why a shared name alone never reaches
 * "likely duplicate" on its own. `excludeCustomerId` skips a customer
 * (e.g. the one a re-checked document is already linked to). */
export async function findDuplicateCandidates(
  companyId: string,
  candidate: CustomerMatchCandidate,
  excludeCustomerId?: string
): Promise<DuplicateMatch[]> {
  if (isMockMode()) {
    return findDuplicateMatches(
      candidate,
      mockCustomers.map((c) => ({ id: c.id, fullName: c.fullName, licenseNumber: c.licenseNumber })),
      excludeCustomerId
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, id_document_number, license_number")
    .eq("company_id", companyId)
    .limit(500)

  if (error) throw error

  return findDuplicateMatches(
    candidate,
    (data ?? []).map((row) => ({
      id: row.id as string,
      fullName: row.full_name as string,
      idDocumentNumber: row.id_document_number as string | null,
      licenseNumber: row.license_number as string | null,
    })),
    excludeCustomerId
  )
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
    return mockMaintenanceRecords
      .filter(
        (m) =>
          ["planned", "scheduled", "in_progress", "waiting_for_parts"].includes(m.status) &&
          m.scheduledOn &&
          m.scheduledOn >= query.startDate &&
          m.scheduledOn <= query.endDate
      )
      .map((m) => ({
        id: m.id,
        vehicleId: m.vehicleId,
        vehicleLabel: m.vehicleLabel,
        date: m.scheduledOn as string,
        title: MAINTENANCE_TYPE_LABELS[m.type] ?? m.type,
      }))
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("maintenance_records")
    .select("id, type, scheduled_on, vehicle:vehicles(id, make, model)")
    .eq("company_id", companyId)
    .in("status", ["planned", "scheduled", "in_progress", "waiting_for_parts"])
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
        title: MAINTENANCE_TYPE_LABELS[r.type] ?? r.type,
      }
    })
}

// ---------------------------------------------------------------------
// Activity (Overview)
// ---------------------------------------------------------------------

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

export interface ActivityLogFilters {
  type?: ActivityType
  dateFrom?: string
  dateTo?: string
  reservationId?: string
  vehicleId?: string
  actorId?: string
}

/** Deliberately does not log page views or every minor field edit — see
 * the activity_log migrations for exactly which action types exist.
 * Filtering by reservation/vehicle reads the same jsonb `metadata` every
 * event already carries (see the phase 4 and 5 migrations' `metadata:
 * jsonb_build_object(...)` calls), not a separate index table. */
export async function getActivityLogList(
  companyId: string,
  filters: ActivityLogFilters = {},
  page = 1,
  pageSize = 30
): Promise<PaginatedResult<ActivityItem>> {
  if (isMockMode()) {
    let items = [...mockRecentActivity]
    if (filters.type) items = items.filter((a) => a.type === filters.type)
    if (filters.dateFrom) items = items.filter((a) => a.timestamp >= filters.dateFrom!)
    if (filters.dateTo) items = items.filter((a) => a.timestamp <= filters.dateTo!)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const total = items.length
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total, page, pageSize }
  }

  const supabase = await createClient()
  let query = supabase
    .from("activity_log")
    .select("id, type, title, description, created_at, actor_id, metadata, actor:profiles(full_name)", { count: "exact" })
    .eq("company_id", companyId)

  if (filters.type) query = query.eq("type", filters.type)
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom)
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo)
  if (filters.reservationId) query = query.eq("metadata->>reservation_id", filters.reservationId)
  if (filters.vehicleId) query = query.eq("metadata->>vehicle_id", filters.vehicleId)
  if (filters.actorId) query = query.eq("actor_id", filters.actorId)

  const start = (page - 1) * pageSize
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(start, start + pageSize - 1)

  if (error) throw error

  return {
    items: (data ?? []).map((row) => mapActivityRow(row as never)),
    total: count ?? 0,
    page,
    pageSize,
  }
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

/** Shared by getOverviewMetrics and getPaymentsSummary so "money currently
 * held on behalf of customers" is computed exactly once, not duplicated
 * — and so it can never accidentally drift between the two pages. */
async function getDepositsHeldMad(companyId: string): Promise<number> {
  if (isMockMode()) {
    return mockDeposits.reduce((sum, d) => sum + depositHeldMad(d), 0)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("deposits")
    .select("collected_amount, returned_amount, retained_amount")
    .eq("company_id", companyId)

  if (error) throw error
  return (data ?? []).reduce(
    (sum, d) =>
      sum +
      depositHeldMad({
        collectedMad: Number(d.collected_amount),
        returnedMad: Number(d.returned_amount),
        retainedMad: Number(d.retained_amount),
      }),
    0
  )
}

export async function getOverviewMetrics(companyId: string): Promise<OverviewMetrics> {
  const [todayPickups, todayReturns, depositsHeldMad, expenseSummary] = await Promise.all([
    getTodayPickups(companyId),
    getTodayReturns(companyId),
    getDepositsHeldMad(companyId),
    getExpenseSummary(companyId, monthStartIso().slice(0, 10), new Date().toISOString().slice(0, 10)),
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
    const revenueThisMonthMad = 187300

    return {
      revenueTodayMad: 8450,
      revenueThisMonthMad,
      outstandingBalanceMad,
      expensesThisMonthMad: expenseSummary.totalMad,
      knownOperatingResultMad: revenueThisMonthMad - expenseSummary.totalMad,
      depositsHeldMad,
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
    expensesThisMonthMad: expenseSummary.totalMad,
    knownOperatingResultMad: revenueThisMonthMad - expenseSummary.totalMad,
    depositsHeldMad,
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

/** Today's pickups and returns as a single time-ordered list with actual
 * clock times, for the Overview page's timeline strip — a different shape
 * from getTodayPickups/getTodayReturns (whose Booking.startDate/endDate
 * are date-only) because a timeline needs the time-of-day. `done`
 * reflects whether the reservation has actually moved past this step
 * (status), not just whether it's scheduled for today. */
export async function getTodayTimeline(companyId: string): Promise<TodayTimelineEntry[]> {
  if (isMockMode()) {
    const TODAY = "2026-07-18"
    const entries: TodayTimelineEntry[] = []
    mockBookings
      .filter((b) => b.startDate === TODAY && b.status !== "cancelled")
      .forEach((b, i) => {
        entries.push({
          id: `${b.id}-pickup`,
          type: "pickup",
          reference: b.reference,
          customerName: b.customer.fullName,
          vehicleLabel: b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : null,
          atIso: `${TODAY}T${String(9 + i).padStart(2, "0")}:00:00+01:00`,
          done: ["active", "completed"].includes(b.status),
        })
      })
    mockBookings
      .filter((b) => b.endDate === TODAY && b.status === "active")
      .forEach((b, i) => {
        entries.push({
          id: `${b.id}-return`,
          type: "return",
          reference: b.reference,
          customerName: b.customer.fullName,
          vehicleLabel: b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : null,
          atIso: `${TODAY}T${String(11 + i).padStart(2, "0")}:30:00+01:00`,
          done: false,
        })
      })
    return entries.sort((a, b) => a.atIso.localeCompare(b.atIso))
  }

  const supabase = await createClient()
  const { startIso, endIso } = todayRange()

  const [pickupRows, returnRows] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, reference, pickup_at, status, customer:customers(full_name), vehicle:vehicles(make, model)")
      .eq("company_id", companyId)
      .gte("pickup_at", startIso)
      .lt("pickup_at", endIso)
      .neq("status", "cancelled"),
    supabase
      .from("reservations")
      .select("id, reference, return_at, status, customer:customers(full_name), vehicle:vehicles(make, model)")
      .eq("company_id", companyId)
      .gte("return_at", startIso)
      .lt("return_at", endIso)
      .in("status", ["active", "completed"]),
  ])

  if (pickupRows.error) throw pickupRows.error
  if (returnRows.error) throw returnRows.error

  type PickupRow = { id: string; reference: string; pickup_at: string; status: string; customer: { full_name: string } | null; vehicle: { make: string; model: string } | null }
  type ReturnRow = { id: string; reference: string; return_at: string; status: string; customer: { full_name: string } | null; vehicle: { make: string; model: string } | null }

  const entries: TodayTimelineEntry[] = [
    ...((pickupRows.data ?? []) as unknown as PickupRow[]).map((r) => ({
      id: `${r.id}-pickup`,
      type: "pickup" as const,
      reference: r.reference,
      customerName: r.customer?.full_name ?? "Unknown customer",
      vehicleLabel: r.vehicle ? `${r.vehicle.make} ${r.vehicle.model}` : null,
      atIso: r.pickup_at,
      done: ["active", "completed"].includes(r.status),
    })),
    ...((returnRows.data ?? []) as unknown as ReturnRow[]).map((r) => ({
      id: `${r.id}-return`,
      type: "return" as const,
      reference: r.reference,
      customerName: r.customer?.full_name ?? "Unknown customer",
      vehicleLabel: r.vehicle ? `${r.vehicle.make} ${r.vehicle.model}` : null,
      atIso: r.return_at,
      done: r.status === "completed",
    })),
  ]

  return entries.sort((a, b) => a.atIso.localeCompare(b.atIso))
}

/** Every vehicle with just enough live context (current renter, next
 * reservation, or active maintenance reason) to render the Overview
 * fleet grid's popovers — batched into a handful of queries rather than
 * one per vehicle. */
export async function getFleetOverview(companyId: string): Promise<FleetOverviewVehicle[]> {
  if (isMockMode()) {
    const now = new Date("2026-07-18T10:00:00+01:00")
    return mockVehicles.map((v): FleetOverviewVehicle => {
      if (v.status === "rented") {
        const active = mockBookings.find((b) => b.vehicle?.id === v.id && b.status === "active")
        if (active) {
          return {
            id: v.id,
            make: v.make,
            model: v.model,
            plate: v.plate,
            status: v.status,
            context: {
              kind: "rented",
              reservationId: active.id,
              customerName: active.customer.fullName,
              returnAtIso: active.endDate,
            },
          }
        }
      }
      if (v.status === "reserved") {
        const upcoming = mockBookings
          .filter(
            (b) =>
              b.vehicle?.id === v.id &&
              ["confirmed", "pending", "request"].includes(b.status) &&
              new Date(b.startDate) >= now
          )
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
        if (upcoming) {
          return {
            id: v.id,
            make: v.make,
            model: v.model,
            plate: v.plate,
            status: v.status,
            context: {
              kind: "reserved",
              reservationId: upcoming.id,
              customerName: upcoming.customer.fullName,
              pickupAtIso: upcoming.startDate,
            },
          }
        }
      }
      if (v.status === "maintenance") {
        const record = mockMaintenanceRecords.find(
          (m) => m.vehicleId === v.id && (m.status === "in_progress" || m.status === "waiting_for_parts")
        )
        if (record) {
          return {
            id: v.id,
            make: v.make,
            model: v.model,
            plate: v.plate,
            status: v.status,
            context: {
              kind: "maintenance",
              maintenanceId: record.id,
              typeLabel: MAINTENANCE_TYPE_LABELS[record.type] ?? record.type,
              scheduledOn: record.scheduledOn,
            },
          }
        }
      }
      return {
        id: v.id,
        make: v.make,
        model: v.model,
        plate: v.plate,
        status: v.status,
        context: { kind: v.status === "available" ? "available" : "unavailable" },
      }
    })
  }

  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  const [vehicleRows, rentedRows, reservedRows, maintenanceRows] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, make, model, registration_number, status")
      .eq("company_id", companyId)
      .order("make"),
    supabase
      .from("reservations")
      .select("id, vehicle_id, return_at, customer:customers(full_name)")
      .eq("company_id", companyId)
      .eq("status", "active")
      .not("vehicle_id", "is", null),
    supabase
      .from("reservations")
      .select("id, vehicle_id, pickup_at, customer:customers(full_name)")
      .eq("company_id", companyId)
      .in("status", ["confirmed", "pending", "request"])
      .not("vehicle_id", "is", null)
      .gte("pickup_at", nowIso)
      .order("pickup_at"),
    supabase
      .from("maintenance_records")
      .select("id, vehicle_id, type, scheduled_on")
      .eq("company_id", companyId)
      .in("status", ["in_progress", "waiting_for_parts"]),
  ])

  if (vehicleRows.error) throw vehicleRows.error
  if (rentedRows.error) throw rentedRows.error
  if (reservedRows.error) throw reservedRows.error
  if (maintenanceRows.error) throw maintenanceRows.error

  type RentedRow = { id: string; vehicle_id: string; return_at: string; customer: { full_name: string } | null }
  type ReservedRow = { id: string; vehicle_id: string; pickup_at: string; customer: { full_name: string } | null }
  type MaintenanceRow = { id: string; vehicle_id: string; type: string; scheduled_on: string | null }

  const rentedByVehicle = new Map<string, RentedRow>()
  for (const r of (rentedRows.data ?? []) as unknown as RentedRow[]) rentedByVehicle.set(r.vehicle_id, r)

  // Reserved rows are already ordered by pickup_at ascending, so the
  // first one seen per vehicle is the soonest upcoming reservation.
  const reservedByVehicle = new Map<string, ReservedRow>()
  for (const r of (reservedRows.data ?? []) as unknown as ReservedRow[]) {
    if (!reservedByVehicle.has(r.vehicle_id)) reservedByVehicle.set(r.vehicle_id, r)
  }

  const maintenanceByVehicle = new Map<string, MaintenanceRow>()
  for (const m of (maintenanceRows.data ?? []) as unknown as MaintenanceRow[]) maintenanceByVehicle.set(m.vehicle_id, m)

  return ((vehicleRows.data ?? []) as { id: string; make: string; model: string; registration_number: string; status: string }[]).map(
    (v): FleetOverviewVehicle => {
      const base = { id: v.id, make: v.make, model: v.model, plate: v.registration_number, status: v.status as VehicleStatus }

      if (v.status === "rented") {
        const r = rentedByVehicle.get(v.id)
        if (r) {
          return {
            ...base,
            context: { kind: "rented", reservationId: r.id, customerName: r.customer?.full_name ?? "Unknown customer", returnAtIso: r.return_at },
          }
        }
      }
      if (v.status === "reserved") {
        const r = reservedByVehicle.get(v.id)
        if (r) {
          return {
            ...base,
            context: { kind: "reserved", reservationId: r.id, customerName: r.customer?.full_name ?? "Unknown customer", pickupAtIso: r.pickup_at },
          }
        }
      }
      if (v.status === "maintenance") {
        const m = maintenanceByVehicle.get(v.id)
        if (m) {
          return {
            ...base,
            context: {
              kind: "maintenance",
              maintenanceId: m.id,
              typeLabel: MAINTENANCE_TYPE_LABELS[m.type as keyof typeof MAINTENANCE_TYPE_LABELS] ?? m.type,
              scheduledOn: m.scheduled_on,
            },
          }
        }
      }
      return { ...base, context: { kind: v.status === "available" ? "available" : "unavailable" } }
    }
  )
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
    // Filename-only in mock mode — the live branch below also matches
    // customer/vehicle names and extracted field values (roadmap phase
    // 04 requirement 7), but mockDocuments has no extraction fixtures to
    // search against.
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

  if (filters.search?.trim()) {
    // Roadmap phase 04 requirement 7: match filename, but also the
    // customer/vehicle a document is linked to and its own extracted
    // field values (licence number, plate, VIN, ...) — not just the
    // filename, same "resolve related ids, then .in()" pattern as
    // getReservationsList's search above.
    const q = escapeIlike(filters.search)
    const [matchingCustomers, matchingVehicles, matchingDocumentIds] = await Promise.all([
      supabase.from("customers").select("id").eq("company_id", companyId).ilike("full_name", `%${q}%`),
      supabase
        .from("vehicles")
        .select("id")
        .eq("company_id", companyId)
        .or(`registration_number.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`),
      searchDocumentIdsByExtractedFields(supabase, companyId, filters.search),
    ])
    const customerIds = (matchingCustomers.data ?? []).map((c) => c.id)
    const vehicleIds = (matchingVehicles.data ?? []).map((v) => v.id)

    const orParts = [`original_filename.ilike.%${q}%`]
    if (customerIds.length > 0) orParts.push(`customer_id.in.(${customerIds.join(",")})`)
    if (vehicleIds.length > 0) orParts.push(`vehicle_id.in.(${vehicleIds.join(",")})`)
    if (matchingDocumentIds.length > 0) orParts.push(`id.in.(${matchingDocumentIds.join(",")})`)
    query = query.or(orParts.join(","))
  }

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
    return {
      revenueTodayMad: metrics.revenueTodayMad,
      revenueThisMonthMad: metrics.revenueThisMonthMad,
      outstandingBalanceMad: metrics.outstandingBalanceMad,
      depositsHeldMad: metrics.depositsHeldMad,
      unresolvedDamageChargesMad: mockDamages
        .filter((d) => !["repaired", "closed"].includes(d.status))
        .reduce((sum, d) => sum + (d.estimatedCostMad ?? 0), 0),
    }
  }

  const supabase = await createClient()
  const { data: damageRows, error: damageError } = await supabase
    .from("damages")
    .select("estimated_cost, status")
    .eq("company_id", companyId)
    .not("status", "in", "(repaired,closed)")

  if (damageError) throw damageError

  const unresolvedDamageChargesMad = (damageRows ?? []).reduce(
    (sum, d) => sum + (d.estimated_cost ? Number(d.estimated_cost) : 0),
    0
  )

  return {
    revenueTodayMad: metrics.revenueTodayMad,
    revenueThisMonthMad: metrics.revenueThisMonthMad,
    outstandingBalanceMad: metrics.outstandingBalanceMad,
    depositsHeldMad: metrics.depositsHeldMad,
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

// ---------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------

const MAINTENANCE_SELECT =
  "id, vehicle_id, type, priority, status, description, scheduled_on, started_on, completed_on, odometer_km, estimated_cost, actual_cost, supplier, next_service_on, next_service_odometer_km, receipt_path, notes, created_by, created_at, vehicle:vehicles(make, model, registration_number)"

function mapMaintenanceRecordRow(row: {
  id: string
  vehicle_id: string
  type: string
  priority: string
  status: string
  description: string | null
  scheduled_on: string | null
  started_on: string | null
  completed_on: string | null
  odometer_km: number | null
  estimated_cost: string | null
  actual_cost: string | null
  supplier: string | null
  next_service_on: string | null
  next_service_odometer_km: number | null
  receipt_path: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  vehicle: { make: string; model: string; registration_number: string } | null
}): Omit<MaintenanceRecord, "createdByName" | "hasLinkedExpense" | "receiptUrl"> & {
  createdBy: string | null
  receiptPath: string | null
} {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleLabel: row.vehicle ? `${row.vehicle.make} ${row.vehicle.model}` : "",
    vehiclePlate: row.vehicle?.registration_number ?? "",
    type: row.type as MaintenanceType,
    priority: row.priority as MaintenancePriority,
    status: row.status as MaintenanceRecordStatus,
    description: row.description,
    scheduledOn: row.scheduled_on,
    startedOn: row.started_on,
    completedOn: row.completed_on,
    odometerKm: row.odometer_km,
    estimatedCostMad: row.estimated_cost != null ? Number(row.estimated_cost) : null,
    actualCostMad: row.actual_cost != null ? Number(row.actual_cost) : null,
    supplier: row.supplier,
    nextServiceOn: row.next_service_on,
    nextServiceOdometerKm: row.next_service_odometer_km,
    receiptPath: row.receipt_path,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export interface MaintenanceListFilters {
  status?: MaintenanceRecordStatus
  vehicleId?: string
  priority?: MaintenancePriority
  search?: string
}

export async function getMaintenanceList(
  companyId: string,
  filters: MaintenanceListFilters = {},
  page = 1,
  pageSize = 20
): Promise<PaginatedResult<MaintenanceRecord>> {
  if (isMockMode()) {
    let items = [...mockMaintenanceRecords]
    if (filters.status) items = items.filter((m) => m.status === filters.status)
    if (filters.vehicleId) items = items.filter((m) => m.vehicleId === filters.vehicleId)
    if (filters.priority) items = items.filter((m) => m.priority === filters.priority)
    if (filters.search) {
      const q = filters.search.toLowerCase()
      items = items.filter(
        (m) => m.vehicleLabel.toLowerCase().includes(q) || m.vehiclePlate.toLowerCase().includes(q)
      )
    }
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const total = items.length
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total, page, pageSize }
  }

  const supabase = await createClient()
  let query = supabase.from("maintenance_records").select(MAINTENANCE_SELECT, { count: "exact" }).eq("company_id", companyId)

  if (filters.status) query = query.eq("status", filters.status)
  if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId)
  if (filters.priority) query = query.eq("priority", filters.priority)

  const start = (page - 1) * pageSize
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(start, start + pageSize - 1)

  if (error) throw error

  let mapped = (data ?? []).map((r) => mapMaintenanceRecordRow(r as never))
  if (filters.search?.trim()) {
    const q = filters.search.toLowerCase()
    mapped = mapped.filter((m) => m.vehicleLabel.toLowerCase().includes(q) || m.vehiclePlate.toLowerCase().includes(q))
  }

  const nameMap = await resolveProfileNames(supabase, mapped.map((m) => m.createdBy))
  const urlMap = await resolveSignedUrls(supabase, mapped.map((m) => m.receiptPath).filter((p): p is string => Boolean(p)))
  const ids = mapped.map((m) => m.id)
  const linkedExpenseIds = new Set<string>()
  if (ids.length > 0) {
    const { data: expenseRows } = await supabase
      .from("expenses")
      .select("maintenance_record_id")
      .in("maintenance_record_id", ids)
    for (const row of expenseRows ?? []) {
      if (row.maintenance_record_id) linkedExpenseIds.add(row.maintenance_record_id)
    }
  }

  return {
    items: mapped.map((m) => ({
      ...m,
      createdByName: m.createdBy ? nameMap.get(m.createdBy) ?? null : null,
      receiptUrl: m.receiptPath ? urlMap.get(m.receiptPath) ?? null : null,
      hasLinkedExpense: linkedExpenseIds.has(m.id),
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function getMaintenanceDetail(companyId: string, maintenanceId: string): Promise<MaintenanceRecord | null> {
  if (isMockMode()) {
    return mockMaintenanceRecords.find((m) => m.id === maintenanceId) ?? null
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("maintenance_records")
    .select(MAINTENANCE_SELECT)
    .eq("company_id", companyId)
    .eq("id", maintenanceId)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const mapped = mapMaintenanceRecordRow(row as never)
  const nameMap = await resolveProfileNames(supabase, [mapped.createdBy])
  const urlMap = await resolveSignedUrls(supabase, mapped.receiptPath ? [mapped.receiptPath] : [])
  const { data: expenseRow } = await supabase
    .from("expenses")
    .select("id")
    .eq("maintenance_record_id", maintenanceId)
    .maybeSingle()

  return {
    ...mapped,
    createdByName: mapped.createdBy ? nameMap.get(mapped.createdBy) ?? null : null,
    receiptUrl: mapped.receiptPath ? urlMap.get(mapped.receiptPath) ?? null : null,
    hasLinkedExpense: Boolean(expenseRow),
  }
}

export async function getVehicleMaintenanceHistory(companyId: string, vehicleId: string): Promise<MaintenanceRecord[]> {
  const result = await getMaintenanceList(companyId, { vehicleId }, 1, 100)
  return result.items
}

/** Reservations this vehicle is still committed to (not cancelled/no-show/
 * completed) with a future pickup — surfaced so an owner moving a vehicle
 * into maintenance sees what it affects instead of the app silently
 * cancelling anything. */
export async function getUpcomingReservationConflicts(
  companyId: string,
  vehicleId: string
): Promise<ReservationConflict[]> {
  if (isMockMode()) {
    const now = new Date()
    return mockBookings
      .filter(
        (b) =>
          b.vehicle?.id === vehicleId &&
          ["request", "pending", "confirmed"].includes(b.status) &&
          new Date(b.startDate) > now
      )
      .map((b) => ({
        id: b.id,
        reference: b.reference,
        customerName: b.customer.fullName,
        pickupAt: b.startDate,
        returnAt: b.endDate,
        status: b.status,
      }))
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reservations")
    .select("id, reference, pickup_at, return_at, status, customer:customers(full_name)")
    .eq("company_id", companyId)
    .eq("vehicle_id", vehicleId)
    .in("status", ["request", "pending", "confirmed"])
    .gt("pickup_at", new Date().toISOString())
    .order("pickup_at", { ascending: true })

  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    reference: r.reference,
    customerName: (r.customer as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
    pickupAt: r.pickup_at,
    returnAt: r.return_at,
    status: r.status as BookingStatus,
  }))
}

// ---------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------

const EXPENSE_SELECT =
  "id, category, amount, expense_date, method, branch_id, vehicle_id, reservation_id, maintenance_record_id, supplier, description, receipt_path, notes, recorded_by, created_at, branch:branches(name), vehicle:vehicles(make, model), reservation:reservations(reference)"

function mapExpenseRow(row: {
  id: string
  category: string
  amount: string
  expense_date: string
  method: string | null
  branch_id: string | null
  vehicle_id: string | null
  reservation_id: string | null
  maintenance_record_id: string | null
  supplier: string | null
  description: string | null
  receipt_path: string | null
  notes: string | null
  recorded_by: string | null
  created_at: string
  branch: { name: string } | null
  vehicle: { make: string; model: string } | null
  reservation: { reference: string } | null
}): Omit<Expense, "recordedByName" | "receiptUrl"> & { recordedBy: string | null; receiptPath: string | null } {
  return {
    id: row.id,
    category: row.category as ExpenseCategory,
    amountMad: Number(row.amount),
    expenseDate: row.expense_date,
    method: row.method as Expense["method"],
    branchId: row.branch_id,
    branchName: row.branch?.name ?? null,
    vehicleId: row.vehicle_id,
    vehicleLabel: row.vehicle ? `${row.vehicle.make} ${row.vehicle.model}` : null,
    reservationId: row.reservation_id,
    reservationReference: row.reservation?.reference ?? null,
    maintenanceRecordId: row.maintenance_record_id,
    supplier: row.supplier,
    description: row.description,
    receiptPath: row.receipt_path,
    notes: row.notes,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  }
}

export interface ExpenseListFilters {
  category?: ExpenseCategory
  vehicleId?: string
  supplier?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export async function getExpensesList(
  companyId: string,
  filters: ExpenseListFilters = {},
  page = 1,
  pageSize = 25
): Promise<PaginatedResult<Expense>> {
  if (isMockMode()) {
    let items = [...mockExpenses]
    if (filters.category) items = items.filter((e) => e.category === filters.category)
    if (filters.vehicleId) items = items.filter((e) => e.vehicleId === filters.vehicleId)
    if (filters.supplier) items = items.filter((e) => (e.supplier ?? "").toLowerCase().includes(filters.supplier!.toLowerCase()))
    if (filters.dateFrom) items = items.filter((e) => e.expenseDate >= filters.dateFrom!)
    if (filters.dateTo) items = items.filter((e) => e.expenseDate <= filters.dateTo!)
    if (filters.search) {
      const q = filters.search.toLowerCase()
      items = items.filter(
        (e) => (e.description ?? "").toLowerCase().includes(q) || (e.supplier ?? "").toLowerCase().includes(q)
      )
    }
    items.sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime())
    const total = items.length
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total, page, pageSize }
  }

  const supabase = await createClient()
  let query = supabase.from("expenses").select(EXPENSE_SELECT, { count: "exact" }).eq("company_id", companyId)

  if (filters.category) query = query.eq("category", filters.category)
  if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId)
  if (filters.supplier) query = query.ilike("supplier", `%${escapeIlike(filters.supplier)}%`)
  if (filters.dateFrom) query = query.gte("expense_date", filters.dateFrom)
  if (filters.dateTo) query = query.lte("expense_date", filters.dateTo)
  if (filters.search?.trim()) {
    const q = escapeIlike(filters.search)
    query = query.or(`description.ilike.%${q}%,supplier.ilike.%${q}%`)
  }

  const start = (page - 1) * pageSize
  const { data, error, count } = await query
    .order("expense_date", { ascending: false })
    .range(start, start + pageSize - 1)

  if (error) throw error

  const mapped = (data ?? []).map((r) => mapExpenseRow(r as never))
  const nameMap = await resolveProfileNames(supabase, mapped.map((e) => e.recordedBy))
  const urlMap = await resolveSignedUrls(supabase, mapped.map((e) => e.receiptPath).filter((p): p is string => Boolean(p)))

  return {
    items: mapped.map((e) => ({
      ...e,
      recordedByName: e.recordedBy ? nameMap.get(e.recordedBy) ?? null : null,
      receiptUrl: e.receiptPath ? urlMap.get(e.receiptPath) ?? null : null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function getExpenseDetail(companyId: string, expenseId: string): Promise<Expense | null> {
  if (isMockMode()) {
    return mockExpenses.find((e) => e.id === expenseId) ?? null
  }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("company_id", companyId)
    .eq("id", expenseId)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const mapped = mapExpenseRow(row as never)
  const nameMap = await resolveProfileNames(supabase, [mapped.recordedBy])
  const urlMap = await resolveSignedUrls(supabase, mapped.receiptPath ? [mapped.receiptPath] : [])

  return {
    ...mapped,
    recordedByName: mapped.recordedBy ? nameMap.get(mapped.recordedBy) ?? null : null,
    receiptUrl: mapped.receiptPath ? urlMap.get(mapped.receiptPath) ?? null : null,
  }
}

export interface ExpenseSummary {
  totalMad: number
  byCategory: { category: ExpenseCategory; totalMad: number }[]
  byVehicle: { vehicleId: string; vehicleLabel: string; totalMad: number }[]
}

/** Sums expenses for a date range using the same "money recorded in this
 * period" definition the reports page uses (see lib/reports.ts) — kept
 * here rather than duplicated because this is also what the expenses
 * page's own summary cards show. */
export async function getExpenseSummary(companyId: string, dateFrom: string, dateTo: string): Promise<ExpenseSummary> {
  if (isMockMode()) {
    const items = mockExpenses.filter((e) => e.expenseDate >= dateFrom && e.expenseDate <= dateTo)
    const totalMad = items.reduce((sum, e) => sum + e.amountMad, 0)
    const byCategoryMap = new Map<ExpenseCategory, number>()
    const byVehicleMap = new Map<string, { vehicleLabel: string; totalMad: number }>()
    for (const e of items) {
      byCategoryMap.set(e.category, (byCategoryMap.get(e.category) ?? 0) + e.amountMad)
      if (e.vehicleId) {
        const existing = byVehicleMap.get(e.vehicleId)
        byVehicleMap.set(e.vehicleId, {
          vehicleLabel: e.vehicleLabel ?? "",
          totalMad: (existing?.totalMad ?? 0) + e.amountMad,
        })
      }
    }
    return {
      totalMad,
      byCategory: Array.from(byCategoryMap.entries()).map(([category, total]) => ({ category, totalMad: total })),
      byVehicle: Array.from(byVehicleMap.entries()).map(([vehicleId, v]) => ({ vehicleId, ...v })),
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("expenses")
    .select("category, amount, vehicle_id, vehicle:vehicles(make, model)")
    .eq("company_id", companyId)
    .gte("expense_date", dateFrom)
    .lte("expense_date", dateTo)

  if (error) throw error

  const rows = (data ?? []) as unknown as { category: string; amount: string; vehicle_id: string | null; vehicle: { make: string; model: string } | null }[]
  const totalMad = rows.reduce((sum, r) => sum + Number(r.amount), 0)
  const byCategoryMap = new Map<ExpenseCategory, number>()
  const byVehicleMap = new Map<string, { vehicleLabel: string; totalMad: number }>()
  for (const r of rows) {
    const category = r.category as ExpenseCategory
    byCategoryMap.set(category, (byCategoryMap.get(category) ?? 0) + Number(r.amount))
    if (r.vehicle_id) {
      const existing = byVehicleMap.get(r.vehicle_id)
      byVehicleMap.set(r.vehicle_id, {
        vehicleLabel: r.vehicle ? `${r.vehicle.make} ${r.vehicle.model}` : "",
        totalMad: (existing?.totalMad ?? 0) + Number(r.amount),
      })
    }
  }

  return {
    totalMad,
    byCategory: Array.from(byCategoryMap.entries()).map(([category, total]) => ({ category, totalMad: total })),
    byVehicle: Array.from(byVehicleMap.entries()).map(([vehicleId, v]) => ({ vehicleId, ...v })),
  }
}

// ---------------------------------------------------------------------
// Live alerts — see the `notifications` table's own comment (Notifications
// migration) for why these are computed fresh on every call instead of
// stored: they're current-state facts, and a stored copy would just be a
// second place for the truth to drift from. Every query below is scoped
// and limited — this reads a handful of narrow, indexed slices, not the
// company's full history.
// ---------------------------------------------------------------------

export interface LiveAlertOptions {
  maintenanceReminderDays: number
  documentExpiryWarningDays: number
}

export async function getLiveAlerts(companyId: string, options: LiveAlertOptions): Promise<LiveAlert[]> {
  const nowMs = Date.now()
  const now = new Date(nowMs)
  const alerts: LiveAlert[] = []

  if (isMockMode()) {
    for (const b of mockBookings) {
      if (b.status === "active" && b.isOverdue) {
        alerts.push({
          key: `rental_overdue:${b.id}`,
          type: "rental_overdue",
          urgency: "overdue",
          title: `${b.reference} is overdue for return`,
          description: `${b.customer.fullName} — expected back ${b.endDate}`,
          href: `/reservations/${b.id}`,
          dueDate: b.endDate,
        })
      }
      if ((b.status === "active" || b.status === "completed") && b.payment.remainingMad > 0) {
        alerts.push({
          key: `outstanding_balance:${b.id}`,
          type: "outstanding_balance",
          urgency: "due_now",
          title: `${b.reference} has an outstanding balance`,
          description: `${b.customer.fullName} owes ${b.payment.remainingMad} MAD`,
          href: `/reservations/${b.id}`,
          dueDate: null,
        })
      }
    }
    for (const d of mockDeposits) {
      const booking = mockBookings.find((b) => b.id === d.reservationId)
      if (booking?.status === "completed" && d.collectedMad > depositHeldMad({ collectedMad: 0, returnedMad: d.returnedMad, retainedMad: d.retainedMad }) && depositHeldMad(d) > 0) {
        alerts.push({
          key: `deposit_unresolved:${d.reservationId}`,
          type: "deposit_unresolved",
          urgency: "due_now",
          title: `Deposit not yet resolved for ${booking.reference}`,
          description: `${depositHeldMad(d)} MAD still held`,
          href: `/reservations/${d.reservationId}`,
          dueDate: null,
        })
      }
    }
    for (const m of mockMaintenanceRecords) {
      if (["planned", "scheduled", "waiting_for_parts"].includes(m.status) && m.scheduledOn) {
        const days = daysUntilFn(m.scheduledOn, nowMs)
        if (days <= options.maintenanceReminderDays) {
          const urgency = urgencyForDaysUntil(days)
          alerts.push({
            key: `maintenance_${urgency === "overdue" ? "overdue" : "due"}:${m.id}`,
            type: urgency === "overdue" ? "maintenance_overdue" : "maintenance_due",
            urgency,
            title: `${m.vehicleLabel} — ${m.type.replace("_", " ")}`,
            description: `Scheduled ${m.scheduledOn}`,
            href: `/maintenance/${m.id}`,
            dueDate: m.scheduledOn,
          })
        }
      }
    }
    // Vehicle document / customer licence expiry alerts are live-mode only:
    // the base mock Vehicle/Customer fixtures don't carry expiry dates
    // (only VehicleDetail/CustomerDetail do), so there's nothing to derive
    // them from here.
    for (const d of mockDamages) {
      if (d.status === "newly_discovered" || d.status === "under_review") {
        alerts.push({
          key: `damage_recorded:${d.id}`,
          type: "damage_recorded",
          urgency: "due_now",
          title: `${d.vehicleLabel} — damage needs review`,
          description: d.description,
          href: `/damages/${d.id}`,
          dueDate: null,
        })
      }
    }
    return alerts.sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "overdue" ? -1 : 1))
  }

  const supabase = await createClient()
  const warningIso = new Date(nowMs + options.documentExpiryWarningDays * 86_400_000).toISOString().slice(0, 10)
  const maintenanceWindowIso = new Date(nowMs + options.maintenanceReminderDays * 86_400_000).toISOString().slice(0, 10)
  const soonIso = new Date(nowMs + 86_400_000).toISOString()

  const [overdueRes, balanceRes, depositRes, maintenanceRes, vehicleDocsRes, licenceRes, damageRes, unavailableRes] =
    await Promise.all([
      supabase
        .from("reservations")
        .select("id, reference, return_at, customer:customers(full_name)")
        .eq("company_id", companyId)
        .eq("status", "active")
        .lt("return_at", now.toISOString())
        .limit(25),
      supabase
        .from("reservations")
        .select("id, reference, remaining_balance, customer:customers(full_name)")
        .eq("company_id", companyId)
        .in("status", ["active", "completed"])
        .gt("remaining_balance", 0)
        .limit(25),
      supabase
        .from("deposits")
        .select("reservation_id, collected_amount, returned_amount, retained_amount, reservation:reservations(reference, status)")
        .eq("company_id", companyId)
        .gt("collected_amount", 0)
        .limit(50),
      supabase
        .from("maintenance_records")
        .select("id, type, scheduled_on, vehicle:vehicles(make, model)")
        .eq("company_id", companyId)
        .in("status", ["planned", "scheduled", "waiting_for_parts"])
        .not("scheduled_on", "is", null)
        .lte("scheduled_on", maintenanceWindowIso)
        .limit(25),
      supabase
        .from("vehicles")
        .select("id, make, model, insurance_expires_on, registration_expires_on, inspection_expires_on")
        .eq("company_id", companyId)
        .or(
          `insurance_expires_on.lte.${warningIso},registration_expires_on.lte.${warningIso},inspection_expires_on.lte.${warningIso}`
        )
        .limit(25),
      supabase
        .from("reservations")
        .select("id, reference, status, customer:customers(full_name, license_expires_on)")
        .eq("company_id", companyId)
        .in("status", ["active", "confirmed"])
        .limit(50),
      supabase
        .from("damages")
        .select("id, vehicle_area, description, vehicle:vehicles(make, model)")
        .eq("company_id", companyId)
        .in("status", ["newly_discovered", "under_review"])
        .limit(25),
      supabase
        .from("vehicles")
        .select(
          "id, make, model, status, reservations:reservations(id, reference, pickup_at, status)"
        )
        .eq("company_id", companyId)
        .in("status", ["maintenance", "unavailable"])
        .limit(50),
    ])

  for (const r of overdueRes.data ?? []) {
    const customer = r.customer as unknown as { full_name: string } | null
    alerts.push({
      key: `rental_overdue:${r.id}`,
      type: "rental_overdue",
      urgency: "overdue",
      title: `${r.reference} is overdue for return`,
      description: `${customer?.full_name ?? "Customer"} — expected back ${formatInTimeZoneShort(r.return_at)}`,
      href: `/reservations/${r.id}`,
      dueDate: r.return_at,
    })
  }

  for (const r of balanceRes.data ?? []) {
    const customer = r.customer as unknown as { full_name: string } | null
    alerts.push({
      key: `outstanding_balance:${r.id}`,
      type: "outstanding_balance",
      urgency: "due_now",
      title: `${r.reference} has an outstanding balance`,
      description: `${customer?.full_name ?? "Customer"} owes ${Number(r.remaining_balance)} MAD`,
      href: `/reservations/${r.id}`,
      dueDate: null,
    })
  }

  for (const d of depositRes.data ?? []) {
    const reservation = d.reservation as unknown as { reference: string; status: string } | null
    if (reservation?.status !== "completed") continue
    const held = depositHeldMad({
      collectedMad: Number(d.collected_amount),
      returnedMad: Number(d.returned_amount),
      retainedMad: Number(d.retained_amount),
    })
    if (held <= 0) continue
    alerts.push({
      key: `deposit_unresolved:${d.reservation_id}`,
      type: "deposit_unresolved",
      urgency: "due_now",
      title: `Deposit not yet resolved for ${reservation.reference}`,
      description: `${held} MAD still held`,
      href: `/reservations/${d.reservation_id}`,
      dueDate: null,
    })
  }

  for (const m of maintenanceRes.data ?? []) {
    const vehicle = m.vehicle as unknown as { make: string; model: string } | null
    const days = daysUntilFn(m.scheduled_on as string, nowMs)
    const urgency = urgencyForDaysUntil(days)
    alerts.push({
      key: `maintenance_${urgency === "overdue" ? "overdue" : "due"}:${m.id}`,
      type: urgency === "overdue" ? "maintenance_overdue" : "maintenance_due",
      urgency,
      title: `${vehicle ? `${vehicle.make} ${vehicle.model}` : "Vehicle"} — ${String(m.type).replace("_", " ")}`,
      description: `Scheduled ${m.scheduled_on}`,
      href: `/maintenance/${m.id}`,
      dueDate: m.scheduled_on as string,
    })
  }

  const docFields: { field: "insurance_expires_on" | "registration_expires_on" | "inspection_expires_on"; label: string }[] = [
    { field: "insurance_expires_on", label: "Insurance" },
    { field: "registration_expires_on", label: "Registration" },
    { field: "inspection_expires_on", label: "Technical inspection" },
  ]
  for (const v of vehicleDocsRes.data ?? []) {
    for (const { field, label } of docFields) {
      const date = v[field] as string | null
      if (!date) continue
      const days = daysUntilFn(date, nowMs)
      if (days > options.documentExpiryWarningDays) continue
      alerts.push({
        key: `vehicle_document_expiring:${v.id}:${field}`,
        type: "vehicle_document_expiring",
        urgency: urgencyForDaysUntil(days),
        title: `${v.make} ${v.model} — ${label.toLowerCase()} ${days < 0 ? "expired" : "expiring"}`,
        description: `${label} ${days < 0 ? "expired" : "expires"} ${date}`,
        href: `/fleet/${v.id}`,
        dueDate: date,
      })
    }
  }

  for (const r of licenceRes.data ?? []) {
    const customer = r.customer as unknown as { full_name: string; license_expires_on: string | null } | null
    if (!customer?.license_expires_on) continue
    const days = daysUntilFn(customer.license_expires_on, nowMs)
    if (days > options.documentExpiryWarningDays) continue
    alerts.push({
      key: `licence_expiring:${r.id}`,
      type: "licence_expiring",
      urgency: urgencyForDaysUntil(days),
      title: `${customer.full_name} — driving licence ${days < 0 ? "expired" : "expiring"}`,
      description: `Reservation ${r.reference}`,
      href: `/reservations/${r.id}`,
      dueDate: customer.license_expires_on,
    })
  }

  for (const d of damageRes.data ?? []) {
    const vehicle = d.vehicle as unknown as { make: string; model: string } | null
    alerts.push({
      key: `damage_recorded:${d.id}`,
      type: "damage_recorded",
      urgency: "due_now",
      title: `${vehicle ? `${vehicle.make} ${vehicle.model}` : "Vehicle"} — damage needs review`,
      description: d.description,
      href: `/damages/${d.id}`,
      dueDate: null,
    })
  }

  for (const v of unavailableRes.data ?? []) {
    const upcoming = (v.reservations as unknown as { id: string; reference: string; pickup_at: string; status: string }[] | null ?? [])
      .filter((r) => ["request", "pending", "confirmed"].includes(r.status) && r.pickup_at >= soonIso)
      .sort((a, b) => a.pickup_at.localeCompare(b.pickup_at))[0]
    if (!upcoming) continue
    alerts.push({
      key: `vehicle_unavailable_upcoming_reservation:${v.id}`,
      type: "vehicle_unavailable_upcoming_reservation",
      urgency: "due_soon",
      title: `${v.make} ${v.model} is unavailable but booked soon`,
      description: `${upcoming.reference} — reassign or resolve availability`,
      href: `/fleet/${v.id}`,
      dueDate: upcoming.pickup_at,
    })
  }

  return alerts.sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "overdue" ? -1 : 1))
}

function formatInTimeZoneShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

const URGENCY_TO_PRIORITY: Record<LiveAlert["urgency"], NotificationItem["priority"]> = {
  due_soon: "normal",
  due_now: "high",
  overdue: "urgent",
}

export interface NotificationFeed {
  items: NotificationItem[]
  unreadCount: number
}

/** Merges the two notification sources described on the `notifications`
 * table itself: live alerts (recomputed here, hidden once the user has a
 * dismissal marker for that alert's key) and genuine stored events
 * (read/unread tracked directly on the row). Muted types are dropped
 * before either source is even queried where possible. */
export async function getNotificationFeed(
  companyId: string,
  userId: string,
  options: LiveAlertOptions & { mutedTypes: string[] }
): Promise<NotificationFeed> {
  const [liveAlerts, dismissedKeys, eventRows] = await Promise.all([
    getLiveAlerts(companyId, options),
    getDismissedAlertKeys(userId),
    getStoredNotificationEvents(companyId, userId),
  ])

  const mutedSet = new Set(options.mutedTypes)
  const liveItems: NotificationItem[] = liveAlerts
    .filter((a) => !dismissedKeys.has(a.key) && !mutedSet.has(a.type))
    .map((a) => ({
      id: a.key,
      source: "live" as const,
      type: a.type,
      title: a.title,
      description: a.description,
      priority: URGENCY_TO_PRIORITY[a.urgency],
      href: a.href,
      isRead: false,
      createdAt: a.dueDate ?? new Date().toISOString(),
    }))

  const eventItems: NotificationItem[] = eventRows
    .filter((e) => !mutedSet.has(e.type))
    .map((e) => ({
      id: e.id,
      source: "event" as const,
      type: e.type,
      title: e.title,
      description: e.description,
      priority: e.priority,
      href: e.href,
      isRead: e.isRead,
      createdAt: e.createdAt,
    }))

  const items = [...liveItems, ...eventItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const unreadCount = items.filter((i) => !i.isRead).length

  return { items, unreadCount }
}

async function getDismissedAlertKeys(userId: string): Promise<Set<string>> {
  if (isMockMode()) return new Set()

  const supabase = await createClient()
  const { data } = await supabase.from("notifications").select("key").eq("user_id", userId).not("key", "is", null)
  return new Set((data ?? []).map((r) => r.key as string))
}

async function getStoredNotificationEvents(
  companyId: string,
  userId: string
): Promise<
  { id: string; type: NotificationType; title: string; description: string | null; priority: NotificationItem["priority"]; href: string | null; isRead: boolean; createdAt: string }[]
> {
  if (isMockMode()) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, description, priority, link_href, read_at, created_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .is("key", null)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type as NotificationType,
    title: r.title,
    description: r.description,
    priority: r.priority as NotificationItem["priority"],
    href: r.link_href,
    isRead: Boolean(r.read_at),
    createdAt: r.created_at,
  }))
}

// ---------------------------------------------------------------------
// Owner reports
// ---------------------------------------------------------------------
//
// Default view: "money recorded during the selected period" (payments and
// expenses dated within [fromIso, toIso)) — the brief explicitly asks for
// one clearly-labelled default rather than every possible view. Two
// simplifications, both intentional and both noted in the completion
// report rather than silently assumed:
//   - depositsHeldMad and depositsRetainedMad are always a *current*
//     snapshot, never period-scoped — reconstructing "deposits held as of
//     a past date" would need historical balance snapshots, which the
//     brief explicitly says not to build yet ("no complex materialized
//     analytics systems").
//   - outstandingBalanceMad is likewise "as of today", not "as of the
//     period end", for the same reason.

export async function getFinancialReport(companyId: string, range: ReportDateRange): Promise<FinancialReport> {
  const [expenseSummary, depositsHeldMad] = await Promise.all([
    getExpenseSummary(companyId, range.fromIso.slice(0, 10), range.toIso.slice(0, 10)),
    getDepositsHeldMad(companyId),
  ])
  const maintenanceCostMad = expenseSummary.byCategory.find((c) => c.category === "maintenance")?.totalMad ?? 0

  if (isMockMode()) {
    const inRange = mockPaymentLedger.filter((p) => p.paidAt >= range.fromIso && p.paidAt < range.toIso)
    const sumType = (type: string) => inRange.filter((p) => p.transactionType === type).reduce((s, p) => s + p.amountMad, 0)
    const outstandingBalanceMad = mockBookings
      .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
      .reduce((sum, b) => sum + b.payment.remainingMad, 0)
    const depositsRetainedMad = mockDeposits.reduce((sum, d) => sum + d.retainedMad, 0)
    const rentalPaymentsMad = sumType("rental_payment")

    return {
      rentalPaymentsMad,
      additionalChargesMad: sumType("additional_charge"),
      discountsMad: 0,
      refundsMad: sumType("refund"),
      outstandingBalanceMad,
      depositsCollectedMad: sumType("deposit_collection"),
      depositsHeldMad,
      depositsReturnedMad: sumType("deposit_return"),
      depositsRetainedMad,
      expensesMad: expenseSummary.totalMad,
      maintenanceCostMad,
      knownOperatingResultMad: knownOperatingResult(rentalPaymentsMad, expenseSummary.totalMad),
    }
  }

  const supabase = await createClient()
  const [paymentRows, reservationRows, depositRows] = await Promise.all([
    supabase
      .from("payments")
      .select("transaction_type, amount")
      .eq("company_id", companyId)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
    supabase
      .from("reservations")
      .select("remaining_balance, status")
      .eq("company_id", companyId)
      .not("status", "in", "(cancelled,no_show)"),
    supabase.from("deposits").select("retained_amount").eq("company_id", companyId),
  ])

  if (paymentRows.error) throw paymentRows.error
  if (reservationRows.error) throw reservationRows.error
  if (depositRows.error) throw depositRows.error

  const sumType = (type: string) =>
    (paymentRows.data ?? []).filter((p) => p.transaction_type === type).reduce((s, p) => s + Number(p.amount), 0)
  const outstandingBalanceMad = (reservationRows.data ?? []).reduce((sum, r) => sum + Number(r.remaining_balance), 0)
  const depositsRetainedMad = (depositRows.data ?? []).reduce((sum, d) => sum + Number(d.retained_amount), 0)
  const rentalPaymentsMad = sumType("rental_payment")

  return {
    rentalPaymentsMad,
    additionalChargesMad: sumType("additional_charge"),
    discountsMad: 0,
    refundsMad: sumType("refund"),
    outstandingBalanceMad,
    depositsCollectedMad: sumType("deposit_collection"),
    depositsHeldMad,
    depositsReturnedMad: sumType("deposit_return"),
    depositsRetainedMad,
    expensesMad: expenseSummary.totalMad,
    maintenanceCostMad,
    knownOperatingResultMad: knownOperatingResult(rentalPaymentsMad, expenseSummary.totalMad),
  }
}

/** Rental days / reservation counts are attributed to the period a
 * reservation's pickup falls in — "rentals that started in this window",
 * not a day-by-day interval intersection (which would need real
 * date-range math per row); a clear, defensible definition, applied the
 * same way everywhere it's used. */
export async function getFleetPerformanceReport(companyId: string, range: ReportDateRange): Promise<FleetPerformanceReport> {
  const periodDays = Math.max(1, Math.round((new Date(range.toIso).getTime() - new Date(range.fromIso).getTime()) / 86_400_000))

  if (isMockMode()) {
    const fleetSize = mockVehicles.length
    const availableCount = mockVehicles.filter((v) => v.status === "available").length
    const activeRentalsCount = mockVehicles.filter((v) => v.status === "rented").length

    const rows: FleetPerformanceRow[] = mockVehicles.map((v) => {
      const vehicleReservations = mockBookings.filter(
        (b) => b.vehicle?.id === v.id && b.startDate >= range.fromIso.slice(0, 10) && b.startDate < range.toIso.slice(0, 10)
      )
      const rentalDays = vehicleReservations
        .filter((b) => b.status === "active" || b.status === "completed")
        .reduce((sum, b) => sum + rentalDaysFor(b.startDate, b.endDate), 0)
      const recordedRevenueMad = mockPaymentLedger
        .filter(
          (p) =>
            p.transactionType === "rental_payment" &&
            p.paidAt >= range.fromIso &&
            p.paidAt < range.toIso &&
            mockBookings.find((b) => b.id === p.reservationId)?.vehicle?.id === v.id
        )
        .reduce((sum, p) => sum + p.amountMad, 0)
      const vehicleExpenses = mockExpenses.filter(
        (e) => e.vehicleId === v.id && e.expenseDate >= range.fromIso.slice(0, 10) && e.expenseDate < range.toIso.slice(0, 10)
      )
      return {
        vehicleId: v.id,
        vehicleLabel: `${v.make} ${v.model}`,
        plate: v.plate,
        status: v.status,
        rentalDays,
        recordedRevenueMad,
        recordedExpensesMad: vehicleExpenses.reduce((sum, e) => sum + e.amountMad, 0),
        maintenanceCostMad: vehicleExpenses.filter((e) => e.category === "maintenance").reduce((sum, e) => sum + e.amountMad, 0),
        downtimeDays: downtimeDaysFn(periodDays, rentalDays),
        reservationCount: vehicleReservations.length,
      }
    })

    return {
      fleetSize,
      availableCount,
      activeRentalsCount,
      occupancyRate: occupancyRateFn(rows.reduce((sum, r) => sum + r.rentalDays, 0), fleetSize, periodDays),
      rows,
    }
  }

  const supabase = await createClient()
  const [vehicleRows, reservationRows, paymentRows, expenseRows] = await Promise.all([
    supabase.from("vehicles").select("id, make, model, registration_number, status").eq("company_id", companyId),
    supabase
      .from("reservations")
      .select("id, vehicle_id, pickup_at, return_at, status")
      .eq("company_id", companyId)
      .gte("pickup_at", range.fromIso)
      .lt("pickup_at", range.toIso)
      .in("status", ["active", "completed"]),
    supabase
      .from("payments")
      .select("amount, reservation:reservations!inner(vehicle_id)")
      .eq("company_id", companyId)
      .eq("transaction_type", "rental_payment")
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
    supabase
      .from("expenses")
      .select("vehicle_id, category, amount")
      .eq("company_id", companyId)
      .not("vehicle_id", "is", null)
      .gte("expense_date", range.fromIso.slice(0, 10))
      .lt("expense_date", range.toIso.slice(0, 10)),
  ])

  if (vehicleRows.error) throw vehicleRows.error
  if (reservationRows.error) throw reservationRows.error
  if (paymentRows.error) throw paymentRows.error
  if (expenseRows.error) throw expenseRows.error

  const vehicles = vehicleRows.data ?? []
  const fleetSize = vehicles.length
  const availableCount = vehicles.filter((v) => v.status === "available").length
  const activeRentalsCount = vehicles.filter((v) => v.status === "rented").length

  const revenueByVehicle = new Map<string, number>()
  for (const p of paymentRows.data ?? []) {
    const vehicleId = (p.reservation as unknown as { vehicle_id: string | null })?.vehicle_id
    if (!vehicleId) continue
    revenueByVehicle.set(vehicleId, (revenueByVehicle.get(vehicleId) ?? 0) + Number(p.amount))
  }

  const rows: FleetPerformanceRow[] = vehicles.map((v) => {
    const vehicleReservations = (reservationRows.data ?? []).filter((r) => r.vehicle_id === v.id)
    const rentalDays = vehicleReservations.reduce((sum, r) => sum + rentalDaysFor(r.pickup_at, r.return_at), 0)
    const vehicleExpenses = (expenseRows.data ?? []).filter((e) => e.vehicle_id === v.id)
    return {
      vehicleId: v.id,
      vehicleLabel: `${v.make} ${v.model}`,
      plate: v.registration_number,
      status: v.status as VehicleStatus,
      rentalDays,
      recordedRevenueMad: revenueByVehicle.get(v.id) ?? 0,
      recordedExpensesMad: vehicleExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
      maintenanceCostMad: vehicleExpenses.filter((e) => e.category === "maintenance").reduce((sum, e) => sum + Number(e.amount), 0),
      downtimeDays: downtimeDaysFn(periodDays, rentalDays),
      reservationCount: vehicleReservations.length,
    }
  })

  return {
    fleetSize,
    availableCount,
    activeRentalsCount,
    occupancyRate: occupancyRateFn(rows.reduce((sum, r) => sum + r.rentalDays, 0), fleetSize, periodDays),
    rows,
  }
}

/** "Created in this period" cohort — every count below is about
 * reservations whose created_at falls in [fromIso, toIso), not their
 * current status alone, so the numbers describe what happened to a
 * consistent group rather than mixing cohorts. */
export async function getReservationPerformanceReport(
  companyId: string,
  range: ReportDateRange
): Promise<ReservationPerformanceReport> {
  if (isMockMode()) {
    const cohort = mockBookings.filter((b) => b.createdAt >= range.fromIso && b.createdAt < range.toIso)
    const confirmed = cohort.filter((b) => ["confirmed", "active", "completed"].includes(b.status)).length
    const completed = cohort.filter((b) => b.status === "completed")
    const cancelled = cohort.filter((b) => b.status === "cancelled").length
    const noShows = cohort.filter((b) => b.status === "no_show").length
    const valued = cohort.filter((b) => b.status !== "cancelled" && b.status !== "no_show")

    return {
      created: cohort.length,
      confirmed,
      completed: completed.length,
      cancelled,
      noShows,
      requestsConvertedRate: cohort.length > 0 ? Math.round((confirmed / cohort.length) * 100) : 0,
      averageDurationDays: completed.length > 0 ? Math.round(completed.reduce((s, b) => s + rentalDaysFor(b.startDate, b.endDate), 0) / completed.length) : 0,
      averageValueMad: valued.length > 0 ? Math.round(valued.reduce((s, b) => s + b.payment.totalDueMad, 0) / valued.length) : 0,
      bySource: [
        { source: "walk_in", count: Math.round(cohort.length * 0.2) },
        { source: "phone", count: Math.round(cohort.length * 0.15) },
        { source: "whatsapp", count: Math.round(cohort.length * 0.35) },
        { source: "website", count: Math.round(cohort.length * 0.2) },
        { source: "partner", count: Math.round(cohort.length * 0.05) },
        { source: "other", count: Math.round(cohort.length * 0.05) },
      ],
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reservations")
    .select("id, status, source, pickup_at, return_at, total_amount")
    .eq("company_id", companyId)
    .gte("created_at", range.fromIso)
    .lt("created_at", range.toIso)

  if (error) throw error

  const cohort = data ?? []
  const confirmed = cohort.filter((r) => ["confirmed", "active", "completed"].includes(r.status)).length
  const completed = cohort.filter((r) => r.status === "completed")
  const cancelled = cohort.filter((r) => r.status === "cancelled").length
  const noShows = cohort.filter((r) => r.status === "no_show").length
  const valued = cohort.filter((r) => r.status !== "cancelled" && r.status !== "no_show")

  const bySourceMap = new Map<ReservationSource, number>()
  for (const r of cohort) {
    const source = r.source as ReservationSource
    bySourceMap.set(source, (bySourceMap.get(source) ?? 0) + 1)
  }

  return {
    created: cohort.length,
    confirmed,
    completed: completed.length,
    cancelled,
    noShows,
    requestsConvertedRate: cohort.length > 0 ? Math.round((confirmed / cohort.length) * 100) : 0,
    averageDurationDays:
      completed.length > 0 ? Math.round(completed.reduce((s, r) => s + rentalDaysFor(r.pickup_at, r.return_at), 0) / completed.length) : 0,
    averageValueMad: valued.length > 0 ? Math.round(valued.reduce((s, r) => s + Number(r.total_amount), 0) / valued.length) : 0,
    bySource: Array.from(bySourceMap.entries()).map(([source, count]) => ({ source, count })),
  }
}

/** newCustomers is period-scoped (created_at in range); every other field
 * is a current company-wide snapshot — see the module comment above for
 * why "as of a past date" reconstruction isn't attempted yet. */
export async function getCustomerOverviewReport(companyId: string, range: ReportDateRange): Promise<CustomerOverviewReport> {
  if (isMockMode()) {
    const bookingCountByCustomer = new Map<string, { fullName: string; count: number }>()
    for (const b of mockBookings) {
      if (b.status === "cancelled" || b.status === "no_show") continue
      const existing = bookingCountByCustomer.get(b.customer.id)
      bookingCountByCustomer.set(b.customer.id, { fullName: b.customer.fullName, count: (existing?.count ?? 0) + 1 })
    }
    const returningCustomers = Array.from(bookingCountByCustomer.values()).filter((c) => isReturningCustomer(c.count)).length
    const activeRentalCustomers = new Set(mockBookings.filter((b) => b.status === "active").map((b) => b.customer.id)).size
    const outstandingBalanceCustomers = new Set(
      mockBookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show" && b.payment.remainingMad > 0).map((b) => b.customer.id)
    ).size
    const topReturning = Array.from(bookingCountByCustomer.entries())
      .map(([customerId, v]) => ({ customerId, fullName: v.fullName, bookingCount: v.count }))
      .sort((a, b) => b.bookingCount - a.bookingCount)
      .slice(0, 5)
    const totalRecordedValueMad = mockPaymentLedger
      .filter((p) => p.transactionType === "rental_payment" && p.paidAt >= range.fromIso && p.paidAt < range.toIso)
      .reduce((sum, p) => sum + p.amountMad, 0)

    return {
      newCustomers: mockCustomers.length > 0 ? Math.min(2, mockCustomers.length) : 0,
      returningCustomers,
      activeRentalCustomers,
      outstandingBalanceCustomers,
      topReturning,
      totalRecordedValueMad,
    }
  }

  const supabase = await createClient()
  const [newCustomersRes, reservationRows, paymentRows] = await Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", range.fromIso)
      .lt("created_at", range.toIso),
    supabase
      .from("reservations")
      .select("customer_id, status, customer:customers(full_name)")
      .eq("company_id", companyId)
      .not("status", "in", "(cancelled,no_show)"),
    supabase
      .from("payments")
      .select("amount")
      .eq("company_id", companyId)
      .eq("transaction_type", "rental_payment")
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
  ])

  if (newCustomersRes.error) throw newCustomersRes.error
  if (reservationRows.error) throw reservationRows.error
  if (paymentRows.error) throw paymentRows.error

  const bookingCountByCustomer = new Map<string, { fullName: string; count: number }>()
  const activeCustomerIds = new Set<string>()
  for (const r of reservationRows.data ?? []) {
    const fullName = (r.customer as unknown as { full_name: string } | null)?.full_name ?? "Unknown"
    const existing = bookingCountByCustomer.get(r.customer_id)
    bookingCountByCustomer.set(r.customer_id, { fullName, count: (existing?.count ?? 0) + 1 })
    if (r.status === "active") activeCustomerIds.add(r.customer_id)
  }
  const returningCustomers = Array.from(bookingCountByCustomer.values()).filter((c) => isReturningCustomer(c.count)).length
  const topReturning = Array.from(bookingCountByCustomer.entries())
    .map(([customerId, v]) => ({ customerId, fullName: v.fullName, bookingCount: v.count }))
    .sort((a, b) => b.bookingCount - a.bookingCount)
    .slice(0, 5)

  const { data: outstandingRows, error: outstandingError } = await supabase
    .from("reservations")
    .select("customer_id")
    .eq("company_id", companyId)
    .not("status", "in", "(cancelled,no_show)")
    .gt("remaining_balance", 0)
  if (outstandingError) throw outstandingError

  return {
    newCustomers: newCustomersRes.count ?? 0,
    returningCustomers,
    activeRentalCustomers: activeCustomerIds.size,
    outstandingBalanceCustomers: new Set((outstandingRows ?? []).map((r) => r.customer_id)).size,
    topReturning,
    totalRecordedValueMad: (paymentRows.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0),
  }
}

/** Same per-vehicle definitions as getFleetPerformanceReport's rows, for
 * a single vehicle over an owner-selected date range — the vehicle detail
 * page's financial summary and the fleet report must never disagree
 * about what "this vehicle's recorded revenue" means. */
export async function getVehicleEconomics(companyId: string, vehicleId: string, range: ReportDateRange): Promise<VehicleEconomics> {
  const fleet = await getFleetPerformanceReport(companyId, range)
  const row = fleet.rows.find((r) => r.vehicleId === vehicleId)
  if (!row) {
    return {
      recordedRevenueMad: 0,
      recordedExpensesMad: 0,
      maintenanceCostMad: 0,
      rentalDays: 0,
      reservationCount: 0,
      downtimeDays: 0,
      knownMarginMad: 0,
    }
  }
  return {
    recordedRevenueMad: row.recordedRevenueMad,
    recordedExpensesMad: row.recordedExpensesMad,
    maintenanceCostMad: row.maintenanceCostMad,
    rentalDays: row.rentalDays,
    reservationCount: row.reservationCount,
    downtimeDays: row.downtimeDays,
    knownMarginMad: knownOperatingResult(row.recordedRevenueMad, row.recordedExpensesMad),
  }
}

// ---------------------------------------------------------------------
// Minimal team access
// ---------------------------------------------------------------------

export async function getTeamMembers(companyId: string): Promise<TeamMember[]> {
  if (isMockMode()) return mockTeamMembers

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("company_memberships")
    .select("id, user_id, role, status, branch_id, created_at, profile:profiles(full_name), branch:branches(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })

  if (error) throw error

  const userIds = (data ?? []).map((m) => m.user_id)
  const emailMap = new Map<string, string>()
  if (userIds.length > 0) {
    // auth.users isn't directly queryable from the client role; profiles
    // doesn't carry email, so this goes through the same admin-safe path
    // as everywhere else that needs it — see get_invitation_preview for
    // the equivalent pattern on the invitations side.
    const { data: authUsers } = await supabase.rpc("get_member_emails", { p_user_ids: userIds })
    for (const row of authUsers ?? []) emailMap.set(row.user_id, row.email)
  }

  return (data ?? []).map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    fullName: (m.profile as unknown as { full_name: string | null } | null)?.full_name ?? null,
    email: emailMap.get(m.user_id) ?? null,
    role: m.role as TeamMember["role"],
    status: m.status as TeamMember["status"],
    branchId: m.branch_id,
    branchName: (m.branch as unknown as { name: string } | null)?.name ?? null,
    createdAt: m.created_at,
  }))
}

export async function getPendingInvitations(companyId: string): Promise<TeamInvitation[]> {
  if (isMockMode()) return mockPendingInvitations

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, branch_id, status, token, expires_at, created_at, branch:branches(name)")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (error) throw error

  return (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as TeamInvitation["role"],
    branchId: i.branch_id,
    branchName: (i.branch as unknown as { name: string } | null)?.name ?? null,
    status: i.status as TeamInvitation["status"],
    token: i.token,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }))
}

export interface InvitationPreview {
  companyName: string
  role: EmployeeRole
  status: string
  expiresAt: string
}

/** No mock-mode fixture — the invite/accept flow only makes sense against
 * a real Supabase project with real auth users, so this returns null in
 * mock mode rather than a fake demo row. */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  if (isMockMode()) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token })
  if (error) throw error
  const row = data?.[0]
  if (!row) return null

  return {
    companyName: row.company_name,
    role: row.role as EmployeeRole,
    status: row.status,
    expiresAt: row.expires_at,
  }
}
