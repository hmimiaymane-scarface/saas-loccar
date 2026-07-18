import Link from "next/link"
import { ArrowUpRight, ArrowDownLeft, Car, Wrench } from "lucide-react"

import type { Booking } from "@/types/rental"
import type { MaintenanceBlock } from "@/lib/data"
import { toDateKey } from "@/lib/calendar-dates"
import { bookingStatusConfig, overdueVisual } from "@/lib/status"
import { StatusBadge } from "@/components/domain/status-badge"
import { Card, CardContent } from "@/components/ui/card"

interface DayAgendaProps {
  bookings: Booking[]
  maintenanceBlocks: MaintenanceBlock[]
  weekStart: Date
}

function DayAgenda({ bookings, maintenanceBlocks, weekStart }: DayAgendaProps) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="flex flex-col gap-3 lg:hidden">
      {days.map((day) => {
        const key = toDateKey(day)
        const pickups = bookings.filter((b) => b.startDate === key)
        const returns = bookings.filter((b) => b.endDate === key && b.startDate !== key)
        const maintenance = maintenanceBlocks.filter((m) => m.date === key)
        const isEmpty = pickups.length === 0 && returns.length === 0 && maintenance.length === 0
        const isToday = key === toDateKey(new Date())

        return (
          <Card key={key}>
            <CardContent className="flex flex-col gap-2.5">
              <p className={`text-sm font-medium ${isToday ? "text-primary" : "text-foreground"}`}>
                {day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
              </p>
              {isEmpty ? (
                <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {pickups.map((b) => (
                    <AgendaRow key={`p-${b.id}`} booking={b} icon={ArrowUpRight} label="Pickup" />
                  ))}
                  {returns.map((b) => (
                    <AgendaRow key={`r-${b.id}`} booking={b} icon={ArrowDownLeft} label="Return" />
                  ))}
                  {maintenance.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5 py-2 text-sm">
                      <Wrench className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="text-foreground">
                        {m.title} · {m.vehicleLabel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function AgendaRow({
  booking,
  icon: Icon,
  label,
}: {
  booking: Booking
  icon: typeof ArrowUpRight
  label: string
}) {
  return (
    <Link href={`/reservations/${booking.id}`} className="flex items-center gap-2.5 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">
          {label} · {booking.customer.fullName}
        </span>
        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Car className="size-3" />
          {booking.vehicle ? `${booking.vehicle.make} ${booking.vehicle.model}` : "Unassigned"}
        </span>
      </div>
      <StatusBadge visual={booking.isOverdue ? overdueVisual : bookingStatusConfig[booking.status]} />
    </Link>
  )
}

export { DayAgenda }
