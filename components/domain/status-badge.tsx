import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface StatusVisual {
  label: string
  icon: LucideIcon
  dot: string
  badge: string
}

interface StatusBadgeProps {
  visual: StatusVisual
  className?: string
}

/**
 * Renders a status as color + icon + label together, so meaning never rests
 * on color alone. Backed by the shared config in `lib/status.ts` — add new
 * statuses there, not by hand-rolling color classes at the call site.
 */
function StatusBadge({ visual, className }: StatusBadgeProps) {
  const Icon = visual.icon
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-200",
        visual.badge,
        className
      )}
    >
      <Icon className="size-3.5" />
      {visual.label}
    </span>
  )
}

function StatusDot({ visual, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("size-2 shrink-0 rounded-full transition-colors duration-200", visual.dot)} />
      {visual.label}
    </span>
  )
}

export { StatusBadge, StatusDot }
export type { StatusVisual }
