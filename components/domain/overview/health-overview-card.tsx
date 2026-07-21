import { ScoreIndicator } from "@/components/domain/intelligence/score-indicator"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import type { ScoreRollup } from "@/lib/intelligence-rollups"

/** Bible requirement 6 — rolls up phase 06/08's per-entity scores into
 * one fleet-wide / customer-base-wide summary, reusing the same
 * `ScoreIndicator` every per-entity Overview card already uses so the
 * vocabulary (Healthy/Needs Attention/Critical) stays identical at
 * every zoom level. Renders nothing when there's no data yet (mock
 * mode, or a live project with no computed intelligence rows) rather
 * than a misleading "0" score. */
function HealthOverviewCard({ title, rollup }: { title: string; rollup: ScoreRollup }) {
  if (rollup.entityCount === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ScoreIndicator label={`Average across ${rollup.entityCount}`} value={rollup.averageScore} />
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {Object.entries(rollup.bandCounts).map(([band, count]) => (
            <span key={band} className="rounded-full bg-muted px-2 py-0.5 capitalize">
              {count} {band}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export { HealthOverviewCard }
