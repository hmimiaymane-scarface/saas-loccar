import Link from "next/link"
import { CalendarClock, CheckCircle2, AlertTriangle, Wrench } from "lucide-react"

import type { Vehicle, FleetCardContext } from "@/types/rental"
import { vehicleStatusConfig } from "@/lib/status"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/domain/status-badge"

/**
 * Productization wave 2 phase 15 — "each vehicle card should show
 * only what matters immediately." Category, daily rate, and mileage
 * (this card's previous content beyond make/model/plate/status) moved
 * out entirely — they're one tap away on `/fleet/[id]` already, same
 * place the advanced intelligence scores already live.
 */
function reservationLine(context: FleetCardContext): string | null {
  if (context.currentReservation) {
    return `${context.currentReservation.customerName} — back ${formatDate(context.currentReservation.atIso)}`
  }
  if (context.nextReservation) {
    return `Next: ${context.nextReservation.customerName}, ${formatDate(context.nextReservation.atIso)}`
  }
  return null
}

function VehicleCard({ vehicle, context }: { vehicle: Vehicle; context?: FleetCardContext }) {
  const availableToday = vehicle.status === "available" && (context?.availableToday ?? true)
  const line = context ? reservationLine(context) : null

  return (
    <Link href={`/fleet/${vehicle.id}`} className="block">
      <Card className="transition-shadow hover:shadow-lg">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-medium text-foreground">
                {vehicle.make} {vehicle.model}
              </p>
              <p className="truncate text-xs text-muted-foreground">{vehicle.plate}</p>
            </div>
            <StatusBadge visual={vehicleStatusConfig[vehicle.status]} className="shrink-0" />
          </div>

          {line && <p className="truncate text-xs text-muted-foreground">{line}</p>}

          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              availableToday ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
            )}
          >
            {availableToday ? <CheckCircle2 className="size-3.5" /> : <CalendarClock className="size-3.5" />}
            {availableToday ? "Available today" : "Not available today"}
          </div>

          {context?.issue && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {context.issue.kind === "damage" ? <AlertTriangle className="size-3.5" /> : <Wrench className="size-3.5" />}
              <span className="truncate">{context.issue.label}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

export { VehicleCard }
