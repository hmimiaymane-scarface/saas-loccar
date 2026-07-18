import Link from "next/link"
import { Gauge } from "lucide-react"

import type { Vehicle } from "@/types/rental"
import { vehicleStatusConfig } from "@/lib/status"
import { formatMad } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/domain/status-badge"

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return (
    <Link href={`/fleet/${vehicle.id}`} className="block">
      <Card className="transition-shadow hover:shadow-lg">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-medium text-foreground">
                {vehicle.make} {vehicle.model}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {vehicle.year} · {vehicle.plate}
              </p>
            </div>
            <StatusBadge visual={vehicleStatusConfig[vehicle.status]} className="shrink-0" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="capitalize text-muted-foreground">{vehicle.category}</span>
            <span className="font-medium text-foreground">{formatMad(vehicle.dailyRateMad)}/day</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Gauge className="size-3.5" />
            {vehicle.mileageKm.toLocaleString()} km
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export { VehicleCard }
