import type { ReservationDetail } from "@/types/rental"
import { buildReturnCompletionSummary } from "@/lib/reservations/completion-summary"
import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const DEPOSIT_TONE_CLASS: Record<"neutral" | "positive" | "warning", string> = {
  neutral: "text-foreground",
  positive: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
}

interface ReturnCompletionSummaryProps {
  reservation: ReservationDetail
}

/**
 * Productization wave 3 phase 30 ("Return Completion Reward") — "the
 * numbers," composed alongside `ReturnCompletedBanner` ("the
 * acknowledgment") under the same `justCompleted=1` gate, per the
 * split phase 28 deliberately left for this phase to complete (see
 * docs/return-workflow-redesign.md). A plain card, not the emerald
 * affirmational treatment the banner above it already owns.
 */
function ReturnCompletionSummary({ reservation }: ReturnCompletionSummaryProps) {
  const summary = buildReturnCompletionSummary(reservation)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Completion summary</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Revenue</span>
          <span className="text-sm font-medium text-foreground">{formatMad(summary.revenueMad)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {summary.durationIsActual ? "Duration (actual)" : "Duration (booked)"}
          </span>
          <span className="text-sm font-medium text-foreground">
            {summary.durationDays} day{summary.durationDays === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Deposit result</span>
          <span className={cn("text-sm font-medium", DEPOSIT_TONE_CLASS[summary.depositResult.tone])}>
            {summary.depositResult.label}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Vehicle state</span>
          <span className="text-sm font-medium text-foreground">{summary.vehicleStateLabel}</span>
        </div>
        {summary.remainingMad > 0 && (
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Balance due</span>
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {formatMad(summary.remainingMad)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { ReturnCompletionSummary }
