import { Trophy, Repeat, Gauge, Moon, Award, Flame, type LucideIcon } from "lucide-react"

import type { PerformanceHighlight, PerformanceHighlightIcon } from "@/lib/gamification"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const HIGHLIGHT_ICON: Record<PerformanceHighlightIcon, LucideIcon> = {
  topRevenue: Trophy,
  topRentals: Repeat,
  topUtilization: Gauge,
  idle: Moon,
  record: Award,
  streak: Flame,
}

/**
 * Roadmap phase 31 ("Business Gamification Layer") — plain sentences,
 * one small monochrome icon each, no coins/XP/cartoon badges (the
 * brief's own explicit non-goal). Purely presentational: which
 * highlights qualify and what they say is decided by
 * `lib/gamification.ts#buildPerformanceHighlights`, not here. Renders
 * nothing (not an empty-state card) when there's nothing to show —
 * same convention `vehicle-insights-section.tsx` already established.
 */
function PerformanceHighlightsCard({ highlights }: { highlights: PerformanceHighlight[] }) {
  if (highlights.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Highlights</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {highlights.map((highlight, i) => {
          const Icon = HIGHLIGHT_ICON[highlight.icon]
          return (
            <div key={i} className="flex items-start gap-2 text-sm text-foreground">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>{highlight.text}</span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export { PerformanceHighlightsCard }
