import Link from "next/link"

import type { FleetPerformanceReport } from "@/types/rental"
import { formatMad } from "@/lib/format"
import { vehicleStatusConfig } from "@/lib/status"
import { StatusBadge } from "@/components/domain/status-badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

function FleetPerformanceTable({ report }: { report: FleetPerformanceReport }) {
  const rows = [...report.rows].sort((a, b) => b.recordedRevenueMad - a.recordedRevenueMad)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Fleet size</span>
            <span className="text-lg font-semibold text-foreground">{report.fleetSize}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Available</span>
            <span className="text-lg font-semibold text-foreground">{report.availableCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Active rentals</span>
            <span className="text-lg font-semibold text-foreground">{report.activeRentalsCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Occupancy</span>
            <span className="text-lg font-semibold text-foreground">{report.occupancyRate}%</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Vehicle</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 text-right font-medium">Rental days</th>
                <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                <th className="py-2 pr-3 text-right font-medium">Expenses</th>
                <th className="py-2 text-right font-medium">Downtime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.vehicleId}>
                  <td className="py-2 pr-3">
                    <Link href={`/fleet/${r.vehicleId}`} className="text-foreground hover:underline">
                      {r.vehicleLabel}
                    </Link>
                    <span className="ml-1.5 text-xs text-muted-foreground">{r.plate}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <StatusBadge visual={vehicleStatusConfig[r.status]} />
                  </td>
                  <td className="py-2 pr-3 text-right text-foreground">{r.rentalDays}</td>
                  <td className="py-2 pr-3 text-right text-foreground">{formatMad(r.recordedRevenueMad)}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">{formatMad(r.recordedExpensesMad)}</td>
                  <td className="py-2 text-right text-muted-foreground">{r.downtimeDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export { FleetPerformanceTable }
