import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScoreIndicator } from "@/components/domain/intelligence/score-indicator"
import type { CustomerIntelligenceResult } from "@/lib/customer-intelligence-store"

const CATEGORY_LABELS: Record<string, string> = {
  economy: "Economy",
  compact: "Compact",
  suv: "SUV",
  van: "Van",
  luxury: "Luxury",
}

/**
 * The Customer Command Center's Overview section (roadmap phase 09
 * requirement 1) — trust score and lifetime-value figures computed in
 * phase 08, given a page to actually render on. Same shape as
 * `VehicleIntelligenceCard`: one score bar, then the supporting
 * numbers in a small grid.
 */
function CustomerIntelligenceCard({ intelligence }: { intelligence: CustomerIntelligenceResult }) {
  const { trust, clv } = intelligence

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
        <CardDescription>
          Computed from this customer&apos;s recorded history — recalculated after every rental, payment, or damage.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ScoreIndicator label="Trust score" value={trust.score} />

        <Separator />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Lifetime revenue</span>
            <span className="text-sm font-semibold text-foreground">{formatMad(clv.lifetimeRevenueMad)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Rentals/year</span>
            <span className="text-sm font-semibold text-foreground">{clv.rentalFrequencyPerYear.toFixed(1)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Avg. reservation</span>
            <span className="text-sm font-semibold text-foreground">{formatMad(clv.averageReservationMad)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Expected value</span>
            <span className="text-sm font-semibold text-foreground">{formatMad(clv.expectedFutureValueMad)}</span>
          </div>
        </div>

        {clv.preferredCategory && (
          <>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Preferred category</span>
              <span className="font-medium text-foreground">{CATEGORY_LABELS[clv.preferredCategory] ?? clv.preferredCategory}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export { CustomerIntelligenceCard }
