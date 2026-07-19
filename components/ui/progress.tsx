"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** Linear progress bar — the one shadcn primitive this app didn't have
 * yet (see today-timeline.tsx's DayProgressRing for the only prior
 * precedent, a one-off SVG ring, not a reusable bar). Deliberately
 * tone-agnostic: callers (e.g. ScoreIndicator) pass indicatorClassName
 * for the fill color rather than this component knowing about
 * lib/tone.ts's Tone concept. */
function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
