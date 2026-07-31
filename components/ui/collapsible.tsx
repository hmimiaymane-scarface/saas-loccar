import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface CollapsibleProps {
  open: boolean
  children: ReactNode
  className?: string
}

/**
 * CSS-only expand/collapse (grid-template-rows 0fr/1fr), not Radix's
 * `Collapsible` — that needs `--radix-collapsible-content-height`
 * measured off a mounted node, which fights content that changes
 * height while open (e.g. a form with conditional fields). This
 * animates smoothly either way with no measurement step.
 *
 * Keep padding off `children`'s own outermost element only if that
 * element also needs to be visible while collapsed (it won't be —
 * `overflow-hidden` here clips the child's whole box, padding
 * included, once the grid row hits 0fr). Any border/padding/rounding
 * belongs on `children`'s own wrapper, not on the `className` prop
 * here — this component's own two layers must stay padding-free for
 * the 0fr collapse to actually reach zero height.
 */
function Collapsible({ open, children, className }: CollapsibleProps) {
  return (
    <div
      className={cn("grid transition-[grid-template-rows] duration-200 ease-in-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      aria-hidden={!open}
      inert={!open}
    >
      <div className={cn("overflow-hidden", className)}>{children}</div>
    </div>
  )
}

export { Collapsible }
