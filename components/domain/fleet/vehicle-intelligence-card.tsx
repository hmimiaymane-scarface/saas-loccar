import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScoreIndicator } from "@/components/domain/intelligence/score-indicator"
import { AiRecommendationCard } from "@/components/domain/intelligence/ai-recommendation-card"
import type { VehicleIntelligenceResult } from "@/lib/vehicle-intelligence-store"
import type { AskAiConfidence } from "@/lib/ai/service"

/** askAI's confidence is deliberately coarse (high/medium/low, see
 * docs/ai-service.md) — ConfidenceIndicator/AiRecommendationCard want a
 * 0-100 number, so this is a fixed, documented mapping, not a claim of
 * real statistical precision. */
const CONFIDENCE_PERCENT: Record<AskAiConfidence, number> = { high: 90, medium: 60, low: 30 }

/**
 * Roadmap phase 06 requirement 6: "enough UI to actually see a score on
 * the vehicle page" — deliberately compact. The full Vehicle Command
 * Center (timeline, all ten Chapter 3 §5 sections) is phase 07; this is
 * just health/profitability/utilization plus any AI recommendations.
 */
function VehicleIntelligenceCard({ intelligence }: { intelligence: VehicleIntelligenceResult }) {
  const { health, profitability, utilization, recommendations, recommendationsConfidence } = intelligence
  const confidencePercent = CONFIDENCE_PERCENT[recommendationsConfidence ?? "medium"]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Vehicle intelligence</CardTitle>
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

      {recommendations && recommendations.length > 0 && (
        <div className="flex flex-col gap-3">
          {recommendations.map((rec, index) => (
            <AiRecommendationCard
              key={index}
              observation={rec.observation}
              reasoning={rec.reasoning}
              suggestedAction={rec.suggestedAction}
              confidence={confidencePercent}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export { VehicleIntelligenceCard }
