import Link from "next/link"
import { Car } from "lucide-react"

import type { Booking, Vehicle } from "@/types/rental"
import type { MaintenanceBlock } from "@/lib/data"
import { dayIndexInWeek, toDateKey } from "@/lib/calendar-dates"
import { groupBookingsByVehicle, groupMaintenanceByVehicle } from "@/lib/calendar-grouping"
import { bookingStatusConfig, overdueVisual } from "@/lib/status"
import { cn } from "@/lib/utils"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

interface FleetTimelineProps {
  vehicles: Vehicle[]
  bookings: Booking[]
  maintenanceBlocks: MaintenanceBlock[]
  weekStart: Date
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function FleetTimeline({ vehicles, bookings, maintenanceBlocks, weekStart }: FleetTimelineProps) {
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const bookingsByVehicle = groupBookingsByVehicle(bookings)
  const maintenanceByVehicle = groupMaintenanceByVehicle(maintenanceBlocks)

  if (vehicles.length === 0) {
    return (
      <div className="hidden lg:block">
        <EmptyPlaceholder
          icon={Car}
          title="Add your first vehicle to see it here"
          description="The weekly timeline shows every vehicle's bookings and maintenance side by side, once your fleet has at least one."
          action={{ label: "Add vehicle", href: "/fleet/new" }}
        />
      </div>
    )
  }

  return (
    <div className="hidden overflow-x-auto rounded-3xl border border-border bg-card lg:block">
      <div
        className="grid min-w-[860px]"
        style={{ gridTemplateColumns: "180px repeat(7, minmax(0,1fr))" }}
      >
        <div className="border-b border-border p-3 text-xs font-medium text-muted-foreground">Vehicle</div>
        {weekDays.map((d, i) => {
          const isToday = toDateKey(d) === toDateKey(new Date())
          return (
            <Link
              key={i}
              href={`/reservations/new?pickup=${toDateKey(d)}`}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 border-b border-l border-border p-2 text-xs transition-colors hover:bg-muted",
                isToday && "bg-primary/5"
              )}
            >
              <span className="text-muted-foreground">{DAY_LABELS[i]}</span>
              <span className={cn("font-medium", isToday ? "text-primary" : "text-foreground")}>
                {d.getDate()}
              </span>
            </Link>
          )
        })}

        {vehicles.map((vehicle, rowIndex) => {
          const row = rowIndex + 2
          const vehicleBookings = bookingsByVehicle.get(vehicle.id) ?? []
          const vehicleMaintenance = maintenanceByVehicle.get(vehicle.id) ?? []

          return (
            <div key={vehicle.id} className="contents">
              <div
                className="flex flex-col justify-center border-b border-border p-3"
                style={{ gridRow: row, gridColumn: 1 }}
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {vehicle.make} {vehicle.model}
                </p>
                <p className="truncate text-xs text-muted-foreground">{vehicle.plate}</p>
              </div>

              {/* Row background cells so grid lines are visible under empty days */}
              {weekDays.map((_, i) => (
                <div
                  key={i}
                  className="border-b border-l border-border"
                  style={{ gridRow: row, gridColumn: i + 2 }}
                />
              ))}

              {vehicleBookings.map((booking) => {
                const startCol = Math.max(0, dayIndexInWeek(booking.startDate, weekStart))
                const endCol = Math.min(6, dayIndexInWeek(booking.endDate, weekStart))
                if (endCol < 0 || startCol > 6 || endCol < startCol) return null
                const visual = booking.isOverdue ? overdueVisual : bookingStatusConfig[booking.status]

                return (
                  <Link
                    key={booking.id}
                    href={`/reservations/${booking.id}`}
                    className={cn(
                      "z-10 m-1 flex items-center truncate rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80",
                      visual.badge
                    )}
                    style={{ gridRow: row, gridColumnStart: startCol + 2, gridColumnEnd: endCol + 3 }}
                  >
                    <span className="truncate">{booking.customer.fullName}</span>
                  </Link>
                )
              })}

              {vehicleMaintenance.map((block) => {
                const col = dayIndexInWeek(block.date, weekStart)
                if (col < 0 || col > 6) return null
                return (
                  <div
                    key={block.id}
                    title={block.title}
                    className="z-10 m-1 flex items-center justify-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                    style={{ gridRow: row, gridColumnStart: col + 2, gridColumnEnd: col + 3 }}
                  >
                    Maint.
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { FleetTimeline }
