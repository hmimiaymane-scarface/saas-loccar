import { CheckCircle2 } from "lucide-react"

import type { MaintenanceAlert } from "@/types/rental"
import { maintenanceSeverityConfig } from "@/lib/status"
import { formatDate } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/domain/status-badge"

function MaintenanceAlertsCard({ alerts }: { alerts: MaintenanceAlert[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance alerts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <CheckCircle2 className="size-4" />
            </div>
            <p className="text-sm">Nothing needs attention</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-sm font-medium text-foreground">
                  {alert.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {alert.vehicle.make} {alert.vehicle.model} · {alert.vehicle.plate}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge visual={maintenanceSeverityConfig[alert.severity]} />
                <p className="text-xs text-muted-foreground">
                  Due {formatDate(alert.dueDate)}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export { MaintenanceAlertsCard }
