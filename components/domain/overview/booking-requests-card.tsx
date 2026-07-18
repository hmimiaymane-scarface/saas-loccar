import { Inbox } from "lucide-react"

import type { Booking } from "@/types/rental"
import { paymentStatusConfig } from "@/lib/status"
import { formatDate, formatMad, formatRelativeTime } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/domain/status-badge"

function BookingRequestsCard({ requests }: { requests: Booking[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent booking requests</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {requests.length === 0 ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-4" />
            </div>
            <p className="text-sm">No pending requests right now</p>
          </div>
        ) : (
          requests.map((booking) => (
            <div key={booking.id} className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-sm font-medium text-foreground">
                  {booking.customer.fullName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {booking.vehicle
                    ? `${booking.vehicle.make} ${booking.vehicle.model}`
                    : `Unassigned · ${booking.requestedCategory ?? "any"} requested`}{" "}
                  · {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Requested {formatRelativeTime(booking.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge visual={paymentStatusConfig[booking.payment.status]} />
                <p className="text-xs text-muted-foreground">
                  {formatMad(booking.payment.totalDueMad)}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export { BookingRequestsCard }
