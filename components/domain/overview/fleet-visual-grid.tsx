"use client"

import Link from "next/link"
import { motion } from "motion/react"

import type { FleetOverviewVehicle } from "@/types/rental"
import { vehicleStatusConfig } from "@/lib/status"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

function contextLine(vehicle: FleetOverviewVehicle): string {
  const { context } = vehicle
  switch (context.kind) {
    case "rented":
      return `Rented to ${context.customerName} — back ${formatDate(context.returnAtIso)}`
    case "reserved":
      return `Reserved for ${context.customerName} — from ${formatDate(context.pickupAtIso)}`
    case "maintenance":
      return context.scheduledOn ? `${context.typeLabel} — since ${formatDate(context.scheduledOn)}` : context.typeLabel
    case "available":
      return "Ready to book"
    case "unavailable":
      return "Not available"
  }
}

function VehicleTile({ vehicle, index }: { vehicle: FleetOverviewVehicle; index: number }) {
  const visual = vehicleStatusConfig[vehicle.status]
  const Icon = visual.icon
  const detail = contextLine(vehicle)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.4) }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-3xl border border-border bg-card p-3 text-center shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          )}
          aria-label={`${vehicle.make} ${vehicle.model}, ${vehicle.plate}. ${visual.label}. ${detail}`}
        >
          <div className={cn("flex size-10 items-center justify-center rounded-full", visual.badge)}>
            <Icon className="size-4.5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="max-w-24 truncate text-xs font-medium text-foreground">
              {vehicle.make} {vehicle.model}
            </span>
            <span className="text-[10px] text-muted-foreground">{vehicle.plate}</span>
          </div>
        </motion.button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", visual.badge)}>
              <Icon className="size-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium text-foreground">
                {vehicle.make} {vehicle.model}
              </span>
              <span className="text-xs text-muted-foreground">{vehicle.plate}</span>
            </div>
          </div>
          <p className="text-sm text-foreground">{detail}</p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/fleet/${vehicle.id}`}>View vehicle</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The Overview's visual replacement for a plain fleet-status bar — every
 * vehicle as a tile you can open for its current context (who has it,
 * when it's due, why it's in the shop), instead of just a count. Status
 * is always shown with both color and an icon/label, never color alone. */
function FleetVisualGrid({ vehicles }: { vehicles: FleetOverviewVehicle[] }) {
  if (vehicles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fleet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No vehicles yet — add your first vehicle to see it here.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {vehicles.map((vehicle, i) => (
            <VehicleTile key={vehicle.id} vehicle={vehicle} index={i} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export { FleetVisualGrid }
