import Link from "next/link"
import { Car, AlertTriangle } from "lucide-react"

import type { Damage } from "@/types/rental"
import { damageStatusConfig } from "@/lib/status"
import { formatDate, formatMad } from "@/lib/format"
import { StatusBadge } from "@/components/domain/status-badge"

function DamageListItem({ damage }: { damage: Damage }) {
  return (
    <Link
      href={`/damages/${damage.id}`}
      className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{damage.vehicleArea}</p>
          <span className="text-xs text-muted-foreground capitalize">{damage.severity}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Car className="size-3.5 shrink-0" />
          <span className="truncate">{damage.vehicleLabel}</span>
          {damage.reservationReference && (
            <>
              <span>·</span>
              <span className="truncate">{damage.reservationReference}</span>
            </>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{damage.description}</p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
        <StatusBadge visual={damageStatusConfig[damage.status]} />
        <div className="flex flex-col items-end">
          {damage.estimatedCostMad != null && (
            <span className="text-sm font-medium text-foreground">{formatMad(damage.estimatedCostMad)}</span>
          )}
          <span className="text-xs text-muted-foreground">{formatDate(damage.createdAt)}</span>
        </div>
        {!damage.preExisting && (
          <span className="hidden items-center gap-1 text-xs text-red-600 dark:text-red-400 sm:inline-flex">
            <AlertTriangle className="size-3.5" />
            New
          </span>
        )}
      </div>
    </Link>
  )
}

export { DamageListItem }
