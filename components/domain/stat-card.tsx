import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { AnimatedNumber } from "@/components/domain/animated-number"

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  tone?: "default" | "warning" | "danger"
  hint?: string
  className?: string
  /** When provided alongside `formatter`, the value counts up on
   * mount/change instead of just appearing — `value` is still required
   * as the server-rendered fallback shown before hydration. `formatter`
   * is a named key, never a function — see AnimatedNumber for why. */
  numericValue?: number
  formatter?: "mad" | "integer"
}

const toneStyles: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-muted text-foreground",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
}

/**
 * The primary "hero" metric card used at the top of Overview. Larger and
 * more prominent than a generic stat tile, since these are the two or three
 * numbers an owner actually opens the app to check.
 */
function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  className,
  numericValue,
  formatter,
}: StatCardProps) {
  return (
    <Card className={cn("gap-4", className)}>
      <div className="flex items-start justify-between px-(--card-spacing)">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            toneStyles[tone]
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <div className="flex flex-col gap-1 px-(--card-spacing)">
        <p className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          {numericValue != null && formatter ? <AnimatedNumber value={numericValue} formatter={formatter} /> : value}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  )
}

export { StatCard }
