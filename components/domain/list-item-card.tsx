import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface ListItemCardProps {
  /** A row that's a single clickable link to a detail page renders as
   * a <Link> (and picks up the hover-shadow affordance). Omit for a
   * row with its own internal action buttons instead of one big link. */
  href?: string
  className?: string
  children: ReactNode
}

/**
 * Roadmap phase 51 (UI Consistency Audit) — the "card list row" idiom
 * every list-item component in this app used to hand-copy
 * independently (`rounded-3xl border border-border bg-card p-4
 * shadow-sm`), now in one place.
 */
function ListItemCard({ href, className, children }: ListItemCardProps) {
  const classes = cn(
    "rounded-3xl border border-border bg-card p-4 shadow-sm",
    href && "transition-shadow hover:shadow-md",
    className
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return <div className={classes}>{children}</div>
}

export { ListItemCard }
