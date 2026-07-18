/**
 * Core domain types for the rental-company product.
 *
 * These describe the shape of data the UI consumes. The initial application
 * shell is powered by mock data (see `lib/mock/*`), but every accessor in
 * `lib/data.ts` returns these same types — so swapping the mock layer for
 * Supabase later should not require touching any component.
 */

export type Currency = string

export type VehicleCategory =
  | "economy"
  | "compact"
  | "suv"
  | "van"
  | "luxury"

// Mirrors the `vehicles.status` check constraint in
// supabase/migrations/20260718120300_branches_vehicles.sql.
export type VehicleStatus =
  | "available"
  | "rented"
  | "reserved"
  | "maintenance"
  | "unavailable"

// Mirrors the `reservations.status` check constraint. "Overdue" is not a
// stored status — it's derived (active + return date in the past); see
// `Booking.isOverdue` below.
export type BookingStatus =
  | "request"
  | "pending"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled"
  | "no_show"

export type PaymentStatus = "paid" | "partial" | "unpaid"

export type MaintenanceType =
  | "oil_change"
  | "tire"
  | "brake"
  | "battery"
  | "engine"
  | "transmission"
  | "air_conditioning"
  | "bodywork"
  | "cleaning"
  | "inspection"
  | "insurance_renewal"
  | "registration_renewal"
  | "routine_service"
  | "repair"
  | "other"

export type MaintenancePriority = "low" | "normal" | "high" | "urgent"

export type MaintenanceRecordStatus =
  | "planned"
  | "scheduled"
  | "in_progress"
  | "waiting_for_parts"
  | "completed"
  | "cancelled"

export type FuelType = "petrol" | "diesel" | "hybrid" | "electric"

export type Transmission = "manual" | "automatic"

export type ReservationSource =
  | "walk_in"
  | "phone"
  | "whatsapp"
  | "website"
  | "partner"
  | "other"

// Mirrors the `activity_log.type` check constraint.
export type ActivityType =
  | "reservation_requested"
  | "reservation_confirmed"
  | "reservation_status_changed"
  | "reservation_updated"
  | "payment_recorded"
  | "vehicle_picked_up"
  | "vehicle_returned"
  | "vehicle_status_changed"
  | "maintenance_completed"
  | "customer_created"
  | "document_uploaded"
  | "member_invited"
  | "pickup_started"
  | "return_started"
  | "inspection_completed"
  | "inspection_corrected"
  | "damage_recorded"
  | "damage_resolved"
  | "deposit_collected"
  | "deposit_returned"
  | "deposit_retained"
  | "maintenance_scheduled"
  | "vehicle_entered_maintenance"
  | "maintenance_cancelled"
  | "expense_recorded"
  | "user_suspended"
  | "user_reactivated"
  | "user_removed"
  | "invitation_accepted"

export type EmployeeRole = "owner" | "manager" | "agent" | "accountant" | "driver"

export type CompanyStatus = "trial" | "active" | "suspended"

export interface RentalCompany {
  id: string
  name: string
  slug: string
  city: string | null
  country: string
  currency: Currency
  /** IANA timezone, e.g. "Africa/Casablanca". All reservation date/time
   * input and display is done in this zone — see lib/timezone.ts. */
  timezone: string
  status: CompanyStatus
  maintenanceReminderDays: number
  documentExpiryWarningDays: number
  agentsCanRecordExpenses: boolean
  mutedNotificationTypes: string[]
}

export interface Employee {
  id: string
  fullName: string
  role: EmployeeRole
  avatarUrl?: string
  email: string
}

export interface Vehicle {
  id: string
  make: string
  model: string
  year: number
  plate: string
  category: VehicleCategory
  status: VehicleStatus
  dailyRateMad: number
  mileageKm: number
  photoUrl?: string
}

export interface Branch {
  id: string
  name: string
  city: string | null
  isMain: boolean
}

export interface VehicleDetail extends Vehicle {
  branchId: string | null
  branchName: string | null
  color: string | null
  seats: number | null
  fuelType: FuelType
  transmission: Transmission
  depositMad: number | null
  insuranceExpiresOn: string | null
  registrationExpiresOn: string | null
  inspectionExpiresOn: string | null
  currentReservation: Booking | null
  upcomingReservations: Booking[]
  recentReservations: Booking[]
  openDamages: Damage[]
  previousDamages: Damage[]
  recentInspections: Inspection[]
  documents: RentalDocument[]
}

export interface Customer {
  id: string
  fullName: string
  phone: string
  email?: string
  licenseNumber: string
  licenseExpiresAt: string
  totalBookings: number
  avatarUrl?: string
}

export interface PaymentSummary {
  status: PaymentStatus
  totalDueMad: number
  amountPaidMad: number
  remainingMad: number
}

export interface BookingVehicleRef {
  id: string
  make: string
  model: string
  plate: string
  category: VehicleCategory
}

export interface BookingCustomerRef {
  id: string
  fullName: string
  phone: string
  avatarUrl?: string
}

export interface Booking {
  id: string
  reference: string
  customer: BookingCustomerRef
  /** Null when the reservation hasn't been assigned a specific vehicle yet
   * — see `requestedCategory` for what the customer asked for instead. */
  vehicle: BookingVehicleRef | null
  requestedCategory: VehicleCategory | null
  startDate: string
  endDate: string
  pickupLocation: string
  returnLocation: string
  status: BookingStatus
  isOverdue: boolean
  payment: PaymentSummary
  createdAt: string
}

export interface ReservationDetail extends Booking {
  /** Full UTC timestamps — `Booking.startDate`/`endDate` are date-only
   * (YYYY-MM-DD), which loses the pickup/return time. Anything that needs
   * to display or edit the time of day (this detail page, the edit form)
   * must use these instead. */
  pickupAt: string
  returnAt: string
  branchId: string | null
  branchName: string | null
  customerDetail: BookingCustomerRef & {
    email?: string
    licenseNumber?: string
  }
  source: ReservationSource
  dailyRateMad: number
  numDays: number
  discountMad: number
  notes: string | null
  createdByName: string | null
  activity: ActivityItem[]
  deposit: Deposit | null
  pickupInspection: Inspection | null
  returnInspection: Inspection | null
  documents: RentalDocument[]
  damages: Damage[]
  payments: PaymentTransaction[]
}

export interface ActivityItem {
  id: string
  type: ActivityType
  title: string
  description: string
  timestamp: string
  actor?: string
  actorId?: string
  reservationId?: string
  vehicleId?: string
}

export interface OverviewMetrics {
  revenueTodayMad: number
  revenueThisMonthMad: number
  outstandingBalanceMad: number
  expensesThisMonthMad: number
  knownOperatingResultMad: number
  depositsHeldMad: number
  fleetTotal: number
  fleetAvailable: number
  fleetRented: number
  fleetReserved: number
  fleetMaintenance: number
  occupancyRate: number
  todayPickupsCount: number
  todayReturnsCount: number
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

export type DocumentCategory =
  | "rental_contract"
  | "identity_document"
  | "driving_licence"
  | "proof_of_address"
  | "insurance_document"
  | "vehicle_registration"
  | "technical_inspection"
  | "payment_receipt"
  | "other"

export interface RentalDocument {
  id: string
  category: DocumentCategory
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  contractReference: string | null
  notes: string | null
  status: "active" | "replaced" | "deleted"
  uploadedByName: string | null
  createdAt: string
  reservationId: string | null
  customerId: string | null
  vehicleId: string | null
  /** Time-limited signed URL, resolved server-side at read time — never a
   * raw storage path (see phase brief: "Do not expose raw storage paths"). */
  url: string | null
}

// ---------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------

export type InspectionType = "pickup" | "return"
export type InspectionStatus = "draft" | "completed"
export type FuelLevel = "empty" | "quarter" | "half" | "three_quarter" | "full"
export type Cleanliness = "clean" | "average" | "dirty"
export type OverallCondition = "excellent" | "good" | "fair" | "poor"
export type ChecklistCategory = "condition" | "documents_and_items"
export type ChecklistResponseValue = "good" | "damaged" | "missing" | "not_applicable"

export interface ChecklistTemplateItem {
  id: string
  key: string
  label: string
  category: ChecklistCategory
  sortOrder: number
}

export interface ChecklistItemResponse {
  id: string
  itemKey: string
  itemLabel: string
  category: ChecklistCategory
  response: ChecklistResponseValue
  notes: string | null
}

export interface Inspection {
  id: string
  reservationId: string
  vehicleId: string
  customerId: string
  type: InspectionType
  status: InspectionStatus
  performedByName: string | null
  odometerKm: number | null
  fuelLevel: FuelLevel | null
  cleanliness: Cleanliness | null
  overallCondition: OverallCondition | null
  notes: string | null
  customerAcknowledged: boolean
  completedAt: string | null
  correctionReason: string | null
  correctedAt: string | null
  createdAt: string
  checklist: ChecklistItemResponse[]
  media: MediaFile[]
}

// ---------------------------------------------------------------------
// Damages
// ---------------------------------------------------------------------

export type DamageStatus =
  | "existing"
  | "newly_discovered"
  | "under_review"
  | "customer_responsible"
  | "agency_responsible"
  | "repair_planned"
  | "repaired"
  | "closed"

export type DamageCategory =
  | "bodywork"
  | "glass"
  | "interior"
  | "mechanical"
  | "tyre"
  | "electrical"
  | "other"

export type DamageSeverity = "minor" | "moderate" | "severe"

export interface Damage {
  id: string
  vehicleId: string
  vehicleLabel: string
  reservationId: string | null
  reservationReference: string | null
  discoveredInInspectionId: string | null
  status: DamageStatus
  category: DamageCategory
  vehicleArea: string
  severity: DamageSeverity
  description: string
  preExisting: boolean
  estimatedCostMad: number | null
  actualCostMad: number | null
  createdByName: string | null
  createdAt: string
  media: MediaFile[]
}

export interface MediaFile {
  id: string
  entityType: "inspection" | "damage"
  entityId: string
  originalFilename: string
  mimeType: string
  caption: string | null
  url: string | null
  createdAt: string
}

// ---------------------------------------------------------------------
// Deposits and the payment ledger
// ---------------------------------------------------------------------

export type DepositStatus =
  | "not_required"
  | "expected"
  | "collected"
  | "partially_collected"
  | "held"
  | "partially_returned"
  | "returned"
  | "retained"
  | "disputed"

export type PaymentMethod = "cash" | "card" | "transfer" | "other"

export interface Deposit {
  id: string
  reservationId: string
  status: DepositStatus
  expectedMad: number
  collectedMad: number
  returnedMad: number
  retainedMad: number
  method: PaymentMethod | null
  collectedAt: string | null
  returnedAt: string | null
  notes: string | null
}

export type PaymentTransactionType =
  | "rental_payment"
  | "deposit_collection"
  | "deposit_return"
  | "refund"
  | "damage_charge"
  | "additional_charge"

export type PaymentDirection = "in" | "out"

export interface PaymentTransaction {
  id: string
  reservationId: string | null
  reservationReference: string | null
  customerId: string
  customerName: string
  transactionType: PaymentTransactionType
  direction: PaymentDirection
  amountMad: number
  method: PaymentMethod
  paidAt: string
  reference: string | null
  notes: string | null
  recordedByName: string | null
}

// ---------------------------------------------------------------------
// Customer detail
// ---------------------------------------------------------------------

export interface CustomerDetail extends Customer {
  nationality: string | null
  idDocumentNumber: string | null
  address: string | null
  notes: string | null
  status: "active" | "flagged" | "blocked"
  reservations: Booking[]
  activeRental: Booking | null
  documents: RentalDocument[]
  outstandingBalanceMad: number
}

// ---------------------------------------------------------------------
// Maintenance (owner-operating-system phase)
// ---------------------------------------------------------------------

export interface MaintenanceRecord {
  id: string
  vehicleId: string
  vehicleLabel: string
  vehiclePlate: string
  type: MaintenanceType
  priority: MaintenancePriority
  status: MaintenanceRecordStatus
  description: string | null
  scheduledOn: string | null
  startedOn: string | null
  completedOn: string | null
  odometerKm: number | null
  estimatedCostMad: number | null
  actualCostMad: number | null
  supplier: string | null
  nextServiceOn: string | null
  nextServiceOdometerKm: number | null
  receiptUrl: string | null
  notes: string | null
  createdByName: string | null
  createdAt: string
  hasLinkedExpense: boolean
}

export interface ReservationConflict {
  id: string
  reference: string
  customerName: string
  pickupAt: string
  returnAt: string
  status: BookingStatus
}

// ---------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------

export type ExpenseCategory =
  | "maintenance"
  | "fuel"
  | "cleaning"
  | "insurance"
  | "technical_inspection"
  | "registration"
  | "rent"
  | "utilities"
  | "marketing"
  | "commission"
  | "office_supplies"
  | "tolls"
  | "fines"
  | "vehicle_purchase"
  | "salary"
  | "parking"
  | "other"

export interface Expense {
  id: string
  category: ExpenseCategory
  amountMad: number
  expenseDate: string
  method: PaymentMethod | null
  branchId: string | null
  branchName: string | null
  vehicleId: string | null
  vehicleLabel: string | null
  reservationId: string | null
  reservationReference: string | null
  maintenanceRecordId: string | null
  supplier: string | null
  description: string | null
  receiptUrl: string | null
  notes: string | null
  recordedByName: string | null
  createdAt: string
}

// ---------------------------------------------------------------------
// Notifications and live alerts
// ---------------------------------------------------------------------

export type NotificationType =
  | "pickup_approaching"
  | "return_approaching"
  | "rental_overdue"
  | "outstanding_balance"
  | "deposit_unresolved"
  | "maintenance_due"
  | "maintenance_overdue"
  | "vehicle_document_expiring"
  | "licence_expiring"
  | "damage_recorded"
  | "inspection_draft_unfinished"
  | "vehicle_unavailable_upcoming_reservation"

export type AlertUrgency = "due_soon" | "due_now" | "overdue"

/** A live alert is computed fresh from current data on every request —
 * never stored — except for its dismissal state (see lib/notifications.ts
 * and the `notifications` table's own comment in the migration). `key` is
 * the stable identity used for that per-user dismissal marker. */
export interface LiveAlert {
  key: string
  type: NotificationType
  urgency: AlertUrgency
  title: string
  description: string
  href: string
  dueDate: string | null
}

export interface NotificationItem {
  /** For a live alert, this is the alert's own `key` (not a real row id
   * until/unless it's dismissed) — see lib/data.ts's getNotificationFeed
   * for how the two sources are merged. */
  id: string
  source: "live" | "event"
  type: NotificationType
  title: string
  description: string | null
  priority: "low" | "normal" | "high" | "urgent"
  href: string | null
  isRead: boolean
  createdAt: string
}

// ---------------------------------------------------------------------
// Minimal team access
// ---------------------------------------------------------------------

export type MembershipStatus = "active" | "suspended"

export interface TeamMember {
  membershipId: string
  userId: string
  fullName: string | null
  email: string | null
  role: EmployeeRole
  status: MembershipStatus
  branchId: string | null
  branchName: string | null
  createdAt: string
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired"

export interface TeamInvitation {
  id: string
  email: string
  role: EmployeeRole
  branchId: string | null
  branchName: string | null
  status: InvitationStatus
  token: string
  expiresAt: string
  createdAt: string
}

// ---------------------------------------------------------------------
// Reports and vehicle-level economics
// ---------------------------------------------------------------------

export interface DateRange {
  fromIso: string
  toIso: string
}

export interface FinancialReport {
  rentalPaymentsMad: number
  additionalChargesMad: number
  discountsMad: number
  refundsMad: number
  outstandingBalanceMad: number
  depositsCollectedMad: number
  depositsHeldMad: number
  depositsReturnedMad: number
  depositsRetainedMad: number
  expensesMad: number
  maintenanceCostMad: number
  knownOperatingResultMad: number
}

export interface FleetPerformanceRow {
  vehicleId: string
  vehicleLabel: string
  plate: string
  status: VehicleStatus
  rentalDays: number
  recordedRevenueMad: number
  recordedExpensesMad: number
  maintenanceCostMad: number
  downtimeDays: number
  reservationCount: number
}

export interface FleetPerformanceReport {
  fleetSize: number
  availableCount: number
  activeRentalsCount: number
  occupancyRate: number
  rows: FleetPerformanceRow[]
}

export interface ReservationPerformanceReport {
  created: number
  confirmed: number
  completed: number
  cancelled: number
  noShows: number
  requestsConvertedRate: number
  averageDurationDays: number
  averageValueMad: number
  bySource: { source: ReservationSource; count: number }[]
}

export interface CustomerOverviewReport {
  newCustomers: number
  returningCustomers: number
  activeRentalCustomers: number
  outstandingBalanceCustomers: number
  topReturning: { customerId: string; fullName: string; bookingCount: number }[]
  totalRecordedValueMad: number
}

export interface VehicleEconomics {
  recordedRevenueMad: number
  recordedExpensesMad: number
  maintenanceCostMad: number
  rentalDays: number
  reservationCount: number
  downtimeDays: number
  knownMarginMad: number
}
