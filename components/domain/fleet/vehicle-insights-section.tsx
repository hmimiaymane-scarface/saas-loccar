import { Sparkles } from "lucide-react"

import { AiRecommendationCard } from "@/components/domain/intelligence/ai-recommendation-card"
import type { VehicleIntelligenceResult } from "@/lib/vehicle-intelligence-store"
import type { AskAiConfidence } from "@/lib/ai/service"

/** askAI's confidence is deliberately coarse (high/medium/low, see
 * docs/ai-service.md) — AiRecommendationCard wants a 0-100 number, so
 * this is a fixed, documented mapping, not a claim of real statistical
 * precision. */
const CONFIDENCE_PERCENT: Record<AskAiConfidence, number> = { high: 90, medium: 60, low: 30 }

/**
 * The bible's "AI Insights" section (roadmap phase 07 requirement 4) —
 * the vehicle-specific recommendations from phase 06, given their own
 * named place on the page rather than living inside the Overview
 * scores card. Renders nothing when there's nothing to show (no AI
 * provider configured, or a fresh vehicle that hasn't been recomputed
 * with a working provider yet) — no empty-state card for an advisory
 * feature that simply hasn't produced anything yet.
 */
function VehicleInsightsSection({ intelligence }: { intelligence: VehicleIntelligenceResult }) {
  const { recommendations, recommendationsConfidence } = intelligence
  if (!recommendations || recommendations.length === 0) return null

  const confidencePercent = CONFIDENCE_PERCENT[recommendationsConfidence ?? "medium"]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="size-4 text-muted-foreground" />
        Insights
      </div>
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
  )
}

export { VehicleInsightsSection }
