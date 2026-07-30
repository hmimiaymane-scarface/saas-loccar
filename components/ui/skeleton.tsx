import { cn } from "@/lib/utils"

/** Pulsing placeholder block for content that's still loading — pairs
 * with route-level `loading.tsx` files (roadmap phase 40, Slow-Network
 * Experience). Intentionally just a shaped `div`: callers size it with
 * `className` to match whatever it's standing in for (a card, a row,
 * an avatar), the same way `Progress`'s indicator is styled by its
 * caller rather than this component knowing about layout. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-2xl bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
