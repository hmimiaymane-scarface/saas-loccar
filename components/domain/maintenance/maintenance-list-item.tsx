import Link from "next/link"
import { Car, AlertTriangle } from "lucide-react"

import type { MaintenanceRecord } from "@/types/rental"
import { maintenanceRecordStatusConfig, maintenancePriorityConfig, MAINTENANCE_TYPE_LABELS } from "@/lib/status"
import { formatDate, formatMad } from "@/lib/format"
import { StatusBadge } from "@/components/domain/status-badge"

function MaintenanceListItem({ record }: { record: MaintenanceRecord }) {
  const dueDate = record.scheduledOn ?? record.completedOn
  return (
    <Link
      href={`/maintenance/${record.id}`}
      className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{MAINTENANCE_TYPE_LABELS[record.type] ?? record.type}</p>
          {record.priority === "urgent" && (
            <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5" /> Urgent
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Car className="size-3.5 shrink-0" />
          <span className="truncate">
            {record.vehicleLabel} · {record.vehiclePlate}
          </span>
        </div>
        {record.description && <p className="truncate text-xs text-muted-foreground">{record.description}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
        <StatusBadge visual={maintenanceRecordStatusConfig[record.status]} />
        <div className="flex flex-col items-end">
          {(record.actualCostMad ?? record.estimatedCostMad) != null && (
            <span className="text-sm font-medium text-foreground">
              {formatMad(record.actualCostMad ?? record.estimatedCostMad!)}
            </span>
          )}
          {dueDate && <span className="text-xs text-muted-foreground">{formatDate(dueDate)}</span>}
        </div>
        <StatusBadge visual={maintenancePriorityConfig[record.priority]} className="hidden sm:inline-flex" />
      </div>
    </Link>
  )
}

export { MaintenanceListItem }
