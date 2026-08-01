import { TrendingUp, TrendingDown, Minus } from "lucide-react"

import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import type { RevenueIntelligenceResult } from "@/lib/revenue-intelligence"

const DIRECTION_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const
const DIRECTION_TONE = { up: "text-emerald-600 dark:text-emerald-400", down: "text-red-600 dark:text-red-400", flat: "text-muted-foreground" } as const

/** Bible requirement 5 — "don't just show a revenue number, show what
 * changed and why." `result.drivers` only ever contains real,
 * threshold-cleared drivers (see `lib/revenue-intelligence.ts`) —
 * this card never invents a plausible-sounding reason when there
 * isn't a real one behind it. */
function RevenueIntelligenceCard({ result, revenueThisMonthMad }: { result: RevenueIntelligenceResult; revenueThisMonthMad: number }) {
  const Icon = DIRECTION_ICON[result.direction]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue this month</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`size-5 ${DIRECTION_TONE[result.direction]}`} />
          <span className="text-2xl font-semibold text-foreground">{formatMad(revenueThisMonthMad)}</span>
        </div>
        <p className="text-sm text-muted-foreground">{result.headline}</p>
        {result.drivers.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 p-3">
            {result.drivers.map((d) => (
              <div key={d.label} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{d.label}:</span> {d.detail}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { RevenueIntelligenceCard }
