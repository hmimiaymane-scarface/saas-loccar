import Link from "next/link"

import type { Booking } from "@/types/rental"
import { bookingStatusConfig, overdueVisual } from "@/lib/status"
import { formatDate, formatMad } from "@/lib/format"
import { StatusBadge } from "@/components/domain/status-badge"

function ReservationRow({ booking }: { booking: Booking }) {
  return (
    <Link
      href={`/reservations/${booking.id}`}
      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-sm font-medium text-foreground">{booking.customer.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {booking.reference} · {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge visual={booking.isOverdue ? overdueVisual : bookingStatusConfig[booking.status]} />
        <span className="text-xs text-muted-foreground">{formatMad(booking.payment.totalDueMad)}</span>
      </div>
    </Link>
  )
}

export { ReservationRow }
