"use client"

import { AlertTriangle, Info, AlertCircle, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { toneClasses, insightPriorityTone, type InsightPriority } from "@/lib/tone"
import { Button } from "@/components/ui/button"

export type { InsightPriority }

const PRIORITY_ICON = {
  critical: AlertTriangle,
  operational: AlertCircle,
  important: TrendingUp,
  informational: Info,
} as const

interface InsightFeedItemProps {
  priority: InsightPriority
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
  className?: string
}

/** A lighter row for a scrolling operational feed (bible Chapter 3 §4,
 * Chapter 10 §5 — "the feed should always contain actions, never
 * information alone"). Priority sets tone without turning the whole
 * feed red: only critical/important get a colored icon, informational
 * stays neutral. */
function InsightFeedItem({
  priority,
  title,
  description,
  actionLabel,
  onAction,
  onDismiss,
  className,
}: InsightFeedItemProps) {
  const tone = toneClasses[insightPriorityTone[priority]]
  const Icon = PRIORITY_ICON[priority]

  return (
    <div className={cn("flex items-start gap-3 py-2.5", className)}>
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", tone.badge)}>
        <Icon aria-hidden="true" className={cn("size-4", tone.icon)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actionLabel ? (
          <Button variant="ghost" size="xs" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

export { InsightFeedItem }
