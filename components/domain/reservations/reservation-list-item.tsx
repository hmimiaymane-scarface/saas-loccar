import Link from "next/link"
import { Car } from "lucide-react"

import type { Booking } from "@/types/rental"
import { bookingStatusConfig, overdueVisual, paymentStatusConfig } from "@/lib/status"
import { formatDate, formatMad } from "@/lib/format"
import { StatusBadge } from "@/components/domain/status-badge"

function ReservationListItem({ booking }: { booking: Booking }) {
  return (
    <Link
      href={`/reservations/${booking.id}`}
      className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{booking.customer.fullName}</p>
          <span className="text-xs text-muted-foreground">{booking.reference}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Car className="size-3.5 shrink-0" />
          {booking.vehicle ? (
            <span className="truncate">
              {booking.vehicle.make} {booking.vehicle.model} · {booking.vehicle.plate}
            </span>
          ) : (
            <span className="truncate">Unassigned · {booking.requestedCategory ?? "any"} requested</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDate(booking.startDate)} – {formatDate(booking.endDate)} · {booking.pickupLocation || "—"}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
        <StatusBadge visual={booking.isOverdue ? overdueVisual : bookingStatusConfig[booking.status]} />
        <div className="flex flex-col items-end">
          <span className="text-sm font-medium text-foreground">{formatMad(booking.payment.totalDueMad)}</span>
          {booking.payment.remainingMad > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatMad(booking.payment.remainingMad)} due
            </span>
          )}
        </div>
        <StatusBadge visual={paymentStatusConfig[booking.payment.status]} className="hidden sm:inline-flex" />
      </div>
    </Link>
  )
}

export { ReservationListItem }
