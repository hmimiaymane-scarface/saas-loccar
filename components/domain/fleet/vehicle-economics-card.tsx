import type { VehicleEconomics } from "@/types/rental"
import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { PeriodSelector } from "@/components/domain/reports/period-selector"
import type { ReportPeriod } from "@/lib/reports"

function VehicleEconomicsCard({ economics, period }: { economics: VehicleEconomics; period: ReportPeriod }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial &amp; operational summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PeriodSelector current={period} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Rental days</span>
            <span className="text-lg font-semibold text-foreground">{economics.rentalDays}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Reservations</span>
            <span className="text-lg font-semibold text-foreground">{economics.reservationCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Days unavailable</span>
            <span className="text-lg font-semibold text-foreground">{economics.downtimeDays}</span>
          </div>
        </div>
        <Separator />
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Recorded revenue</span>
            <span className="text-foreground">{formatMad(economics.recordedRevenueMad)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Recorded expenses</span>
            <span className="text-foreground">{formatMad(economics.recordedExpensesMad)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">— of which maintenance</span>
            <span className="text-foreground">{formatMad(economics.maintenanceCostMad)}</span>
          </div>
          <Separator className="my-1" />
          <div className="flex items-center justify-between font-medium">
            <span className="text-muted-foreground">Known recorded margin</span>
            <span className={economics.knownMarginMad >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
              {formatMad(economics.knownMarginMad)}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Reflects only what&apos;s recorded in this app for the selected period — not a full accounting profit figure.
        </p>
      </CardContent>
    </Card>
  )
}

export { VehicleEconomicsCard }
