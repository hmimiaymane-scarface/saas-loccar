"use client"

import { Sparkles } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConfidenceIndicator } from "@/components/domain/intelligence/confidence-indicator"

interface AiRecommendationCardProps {
  observation: string
  reasoning: string
  suggestedAction: string
  /** 0-100 */
  confidence: number
  onAccept?: () => void
  onDismiss?: () => void
  className?: string
}

/** The canonical way an AI-generated suggestion appears anywhere in the
 * app (bible Chapter 5 §3 "Recommend", Chapter 10 §10). Copy is always
 * plain business language, never chat-bot voice or emoji (Chapter 5
 * §20). AI may recommend; a human decides — that's what the two buttons
 * are for, not automatic execution. */
function AiRecommendationCard({
  observation,
  reasoning,
  suggestedAction,
  confidence,
  onAccept,
  onDismiss,
  className,
}: AiRecommendationCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          AI recommendation
        </div>
        <p className="text-sm text-foreground">{observation}</p>
        <p className="text-sm text-muted-foreground">{reasoning}</p>
        <p className="rounded-2xl bg-muted px-3 py-2 text-sm font-medium text-foreground">{suggestedAction}</p>
        <div className="flex items-center justify-between">
          <ConfidenceIndicator percent={confidence} />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
            <Button size="sm" onClick={onAccept}>
              Accept
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export { AiRecommendationCard }
