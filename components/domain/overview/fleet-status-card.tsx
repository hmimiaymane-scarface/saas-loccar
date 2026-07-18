import { Car } from "lucide-react"

import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface FleetStatusCardProps {
  total: number
  available: number
  rented: number
  reserved: number
  maintenance: number
  occupancyRate: number
}

function FleetStatusCard({
  total,
  available,
  rented,
  reserved,
  maintenance,
  occupancyRate,
}: FleetStatusCardProps) {
  const segments = [
    { label: "Available", count: available, className: "bg-emerald-500" },
    { label: "Rented", count: rented, className: "bg-blue-500" },
    { label: "Reserved", count: reserved, className: "bg-violet-500" },
    { label: "Maintenance", count: maintenance, className: "bg-amber-500" },
  ]

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fleet status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Car className="size-4" />
            </div>
            <p className="text-sm">
              No vehicles yet — add your first vehicle to see fleet status here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet status</CardTitle>
        <CardAction className="text-right">
          <p className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {occupancyRate}%
          </p>
          <p className="text-xs text-muted-foreground">on the road</p>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((segment) => (
            <div
              key={segment.label}
              className={cn("h-full", segment.className)}
              style={{ width: `${(segment.count / total) * 100}%` }}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", segment.className)} />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium text-foreground">
                  {segment.count}
                </span>
                <span className="text-xs text-muted-foreground">{segment.label}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export { FleetStatusCard }
