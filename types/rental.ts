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

// Not a stored column — derived from how close a maintenance item's due
// date is when mapping `maintenance_records` to `MaintenanceAlert`.
export type MaintenanceSeverity = "info" | "warning" | "critical"

export type MaintenanceType =
  | "oil_change"
  | "inspection"
  | "tire"
  | "brake"
  | "insurance_renewal"
  | "registration_renewal"
  | "repair"
  | "other"

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
  depositMad: number | null
  notes: string | null
  createdByName: string | null
  activity: ActivityItem[]
}

export interface MaintenanceAlert {
  id: string
  vehicle: Pick<Vehicle, "id" | "make" | "model" | "plate">
  type: MaintenanceType
  title: string
  dueDate: string
  severity: MaintenanceSeverity
}

export interface ActivityItem {
  id: string
  type: ActivityType
  title: string
  description: string
  timestamp: string
  actor?: string
}

export interface OverviewMetrics {
  revenueTodayMad: number
  revenueThisMonthMad: number
  outstandingBalanceMad: number
  fleetTotal: number
  fleetAvailable: number
  fleetRented: number
  fleetReserved: number
  fleetMaintenance: number
  occupancyRate: number
  todayPickupsCount: number
  todayReturnsCount: number
}
