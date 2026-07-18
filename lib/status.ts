import {
  CheckCircle2,
  Car,
  CalendarClock,
  Wrench,
  Ban,
  AlertTriangle,
  Circle,
  type LucideIcon,
} from "lucide-react"
import type {
  VehicleStatus,
  BookingStatus,
  PaymentStatus,
  DamageStatus,
  DepositStatus,
  MaintenanceRecordStatus,
  MaintenancePriority,
  AlertUrgency,
} from "@/types/rental"

/**
 * Single source of truth for status -> label / icon / color across the app.
 * Color always ships with a label and icon so meaning never depends on hue
 * alone (colorblind-safe, and readable in a glance from across a desk).
 */

interface StatusVisual {
  label: string
  icon: LucideIcon
  dot: string
  badge: string
}

export const vehicleStatusConfig: Record<VehicleStatus, StatusVisual> = {
  available: {
    label: "Available",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  rented: {
    label: "Rented",
    icon: Car,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  reserved: {
    label: "Reserved",
    icon: CalendarClock,
    dot: "bg-violet-500",
    badge:
      "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  unavailable: {
    label: "Unavailable",
    icon: Ban,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
}

export const bookingStatusConfig: Record<BookingStatus, StatusVisual> = {
  request: {
    label: "Requested",
    icon: Circle,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
  pending: {
    label: "Pending",
    icon: CalendarClock,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  active: {
    label: "Active",
    icon: Car,
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: Ban,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-500 dark:bg-zinc-500/10 dark:text-zinc-500",
  },
  no_show: {
    label: "No-show",
    icon: AlertTriangle,
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
}

// Not a stored reservation status — "overdue" means an active booking
// whose return date has passed. Use alongside `bookingStatusConfig` when a
// `Booking.isOverdue` is true.
export const overdueVisual: StatusVisual = {
  label: "Overdue",
  icon: AlertTriangle,
  dot: "bg-red-500",
  badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
}

export const paymentStatusConfig: Record<PaymentStatus, StatusVisual> = {
  paid: {
    label: "Paid",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  partial: {
    label: "Partially paid",
    icon: CalendarClock,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  unpaid: {
    label: "Unpaid",
    icon: AlertTriangle,
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
}

export const damageStatusConfig: Record<DamageStatus, StatusVisual> = {
  existing: {
    label: "Pre-existing",
    icon: Circle,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
  newly_discovered: {
    label: "Newly discovered",
    icon: AlertTriangle,
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
  under_review: {
    label: "Under review",
    icon: CalendarClock,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  customer_responsible: {
    label: "Customer responsible",
    icon: AlertTriangle,
    dot: "bg-orange-500",
    badge:
      "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  },
  agency_responsible: {
    label: "Agency responsible",
    icon: AlertTriangle,
    dot: "bg-violet-500",
    badge:
      "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  },
  repair_planned: {
    label: "Repair planned",
    icon: Wrench,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  repaired: {
    label: "Repaired",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  closed: {
    label: "Closed",
    icon: CheckCircle2,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
}

export const depositStatusConfig: Record<DepositStatus, StatusVisual> = {
  not_required: {
    label: "Not required",
    icon: Circle,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
  expected: {
    label: "Expected",
    icon: CalendarClock,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  partially_collected: {
    label: "Partially collected",
    icon: CalendarClock,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  collected: {
    label: "Collected",
    icon: CheckCircle2,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  held: {
    label: "Held",
    icon: CheckCircle2,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  partially_returned: {
    label: "Partially returned",
    icon: CalendarClock,
    dot: "bg-violet-500",
    badge:
      "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  },
  returned: {
    label: "Returned",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  retained: {
    label: "Retained",
    icon: AlertTriangle,
    dot: "bg-orange-500",
    badge:
      "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  },
  disputed: {
    label: "Disputed",
    icon: AlertTriangle,
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
}

export const maintenanceRecordStatusConfig: Record<MaintenanceRecordStatus, StatusVisual> = {
  planned: {
    label: "Planned",
    icon: Circle,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
  scheduled: {
    label: "Scheduled",
    icon: CalendarClock,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  in_progress: {
    label: "In progress",
    icon: Wrench,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  waiting_for_parts: {
    label: "Waiting for parts",
    icon: AlertTriangle,
    dot: "bg-orange-500",
    badge:
      "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: Ban,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-500 dark:bg-zinc-500/10 dark:text-zinc-500",
  },
}

export const maintenancePriorityConfig: Record<MaintenancePriority, StatusVisual> = {
  low: {
    label: "Low",
    icon: Circle,
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
  normal: {
    label: "Normal",
    icon: Circle,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  high: {
    label: "High",
    icon: AlertTriangle,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  urgent: {
    label: "Urgent",
    icon: AlertTriangle,
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
}

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  fuel: "Fuel",
  cleaning: "Cleaning",
  insurance: "Insurance",
  technical_inspection: "Technical inspection",
  registration: "Registration",
  rent: "Rent",
  utilities: "Utilities",
  marketing: "Marketing",
  commission: "Commission",
  office_supplies: "Office supplies",
  tolls: "Tolls",
  fines: "Fines",
  vehicle_purchase: "Vehicle-related purchase",
  salary: "Salary",
  parking: "Parking",
  other: "Other",
}

export const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  oil_change: "Oil and filters",
  tire: "Tyres",
  brake: "Brakes",
  battery: "Battery",
  engine: "Engine",
  transmission: "Transmission",
  air_conditioning: "Air conditioning",
  bodywork: "Bodywork",
  cleaning: "Cleaning or detailing",
  inspection: "Technical inspection",
  insurance_renewal: "Insurance-related work",
  registration_renewal: "Registration renewal",
  routine_service: "Routine service",
  repair: "Repair",
  other: "Other",
}

export const alertUrgencyConfig: Record<AlertUrgency, StatusVisual> = {
  due_soon: {
    label: "Due soon",
    icon: CalendarClock,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  due_now: {
    label: "Due now",
    icon: AlertTriangle,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  overdue: {
    label: "Overdue",
    icon: AlertTriangle,
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
}
