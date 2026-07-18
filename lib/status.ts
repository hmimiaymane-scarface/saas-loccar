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
  MaintenanceSeverity,
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

export const maintenanceSeverityConfig: Record<
  MaintenanceSeverity,
  StatusVisual
> = {
  info: {
    label: "Upcoming",
    icon: CalendarClock,
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  warning: {
    label: "Due soon",
    icon: AlertTriangle,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  critical: {
    label: "Overdue",
    icon: AlertTriangle,
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
}
