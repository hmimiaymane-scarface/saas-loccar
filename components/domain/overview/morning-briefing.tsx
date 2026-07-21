import { Sparkles } from "lucide-react"

import { formatMad } from "@/lib/format"
import type { OperationsFeedItem } from "@/lib/operations-feed/data"

export interface MorningBriefingInput {
  firstName: string
  todayLabel: string
  pickupsCount: number
  returnsCount: number
  maintenanceDueCount: number
  occupancyRate: number
  revenueThisMonthMad: number
  topFeedItems: OperationsFeedItem[]
}

/** Bible Chapter 10 §3 "Morning Briefing" — "keep it genuinely short,
 * the bible's own example is about 10 lines." Plain sentences, not a
 * dashboard of its own: schedule counts, two business-health numbers,
 * and the top 2-3 things actually worth a human's attention today
 * (pulled straight from the same operations-feed priority ordering
 * everything else on this page trusts — never a separately-invented
 * "recommendation" list). */
function MorningBriefing({ input }: { input: MorningBriefingInput }) {
  const scheduleLine =
    input.pickupsCount === 0 && input.returnsCount === 0
      ? "Nothing scheduled to pick up or return today."
      : `${input.pickupsCount} pickup${input.pickupsCount === 1 ? "" : "s"} and ${input.returnsCount} return${input.returnsCount === 1 ? "" : "s"} scheduled today${input.maintenanceDueCount > 0 ? `, ${input.maintenanceDueCount} vehicle${input.maintenanceDueCount === 1 ? "" : "s"} due for maintenance` : ""}.`

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 px-4 py-3.5 text-sm text-foreground">
      <p className="font-medium">
        Good morning, {input.firstName} — here&apos;s {input.todayLabel} at a glance.
      </p>
      <p className="text-muted-foreground">{scheduleLine}</p>
      <p className="text-muted-foreground">
        Fleet is {input.occupancyRate}% occupied, {formatMad(input.revenueThisMonthMad)} recorded this month.
      </p>
      {input.topFeedItems.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          {input.topFeedItems.map((item) => (
            <p key={item.id} className="flex items-start gap-1.5 text-muted-foreground">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" />
              {item.observation}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export { MorningBriefing }
