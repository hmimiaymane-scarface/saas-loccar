import { ArrowUpRight, ArrowDownLeft, Inbox } from "lucide-react"

import type { Booking } from "@/types/rental"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

function BookingRow({
  booking,
  icon: Icon,
  location,
}: {
  booking: Booking
  icon: typeof ArrowUpRight
  location: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-medium text-foreground">
          {booking.customer.fullName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {booking.vehicle
            ? `${booking.vehicle.make} ${booking.vehicle.model} · ${booking.vehicle.plate}`
            : `Unassigned · ${booking.requestedCategory ?? "any"} requested`}
        </p>
      </div>
      <p className="shrink-0 text-right text-xs text-muted-foreground">{location}</p>
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-4" />
      </div>
      <p className="text-sm">{label}</p>
    </div>
  )
}

function PickupsReturnsCard({
  pickups,
  returns,
}: {
  pickups: Booking[]
  returns: Booking[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Pickups · {pickups.length}
          </p>
          {pickups.length === 0 ? (
            <EmptyRow label="No pickups scheduled today" />
          ) : (
            pickups.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                icon={ArrowUpRight}
                location={booking.pickupLocation}
              />
            ))
          )}
        </div>
        <Separator />
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Returns · {returns.length}
          </p>
          {returns.length === 0 ? (
            <EmptyRow label="No returns scheduled today" />
          ) : (
            returns.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                icon={ArrowDownLeft}
                location={booking.returnLocation}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export { PickupsReturnsCard }
