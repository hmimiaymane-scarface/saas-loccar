import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScoreIndicator } from "@/components/domain/intelligence/score-indicator"
import type { VehicleIntelligenceResult } from "@/lib/vehicle-intelligence-store"

/**
 * The Overview section's scores (roadmap phase 06 requirement 6, phase
 * 07 requirement 3) — health/profitability/utilization only. The AI
 * summary sentence is its own banner at the top of the page (see
 * app/(dashboard)/fleet/[id]/page.tsx) and recommendations are their
 * own AI Insights section
 * (components/domain/fleet/vehicle-insights-section.tsx) — this used to
 * render all three together (phase 06), split apart now that phase 07
 * gives each its own named section on the page.
 */
function VehicleIntelligenceCard({ intelligence }: { intelligence: VehicleIntelligenceResult }) {
  const { health, profitability, utilization } = intelligence

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
        <CardDescription>
          Computed from this vehicle&apos;s recorded history — recalculated when it returns, gets serviced, or is
          damaged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ScoreIndicator label="Health" value={health.score} />

        <Separator />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="text-foreground">Profitability (all-time)</span>
            <span
              className={
                profitability.netMad >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
              }
            >
              {formatMad(profitability.netMad)}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {profitability.breakdown.map((line) => (
              <div key={line.label} className="flex items-center justify-between">
                <span>
                  {line.label}
                  {line.isEstimate ? " (estimate)" : ""}
                </span>
                <span>
                  {line.direction === "in" ? "+" : "-"}
                  {formatMad(line.amountMad)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Occupancy</span>
            <span className="text-sm font-semibold text-foreground">{utilization.occupancyRatePercent}%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Idle days</span>
            <span className="text-sm font-semibold text-foreground">{utilization.idleDays}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Reservations</span>
            <span className="text-sm font-semibold text-foreground">{utilization.reservationCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Revenue/day rented</span>
            <span className="text-sm font-semibold text-foreground">{formatMad(utilization.revenuePerDayMad)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export { VehicleIntelligenceCard }
