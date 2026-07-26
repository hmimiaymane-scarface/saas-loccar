import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"
import { confidenceTier, toneClasses } from "@/lib/tone"

interface ConfidenceIndicatorProps {
  /** 0-100 */
  percent: number
  className?: string
}

const TIER_ICON = {
  positive: CheckCircle2,
  warning: AlertCircle,
  critical: AlertTriangle,
} as const

/** How sure the AI is about a value — deliberately quiet when high
 * (bible Chapter 5 §5: "high-confidence information should continue
 * automatically") and more visible when low (invites review without
 * alarming — no red banner, just a bolder weight and an icon). */
function ConfidenceIndicator({ percent, className }: ConfidenceIndicatorProps) {
  const tier = confidenceTier(percent)
  const tone = toneClasses[tier]
  const Icon = TIER_ICON[tier]
  const isQuiet = tier === "positive"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        isQuiet ? "text-muted-foreground" : cn("font-medium", tone.text),
        className
      )}
    >
      <Icon aria-hidden="true" className={cn("size-3.5", isQuiet ? "text-muted-foreground" : tone.icon)} />
      {Math.round(percent)}% confident
    </span>
  )
}

export { ConfidenceIndicator }
