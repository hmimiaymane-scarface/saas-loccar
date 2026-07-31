import Link from "next/link"
import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface EmptyPlaceholderProps {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; href: string }
}

/**
 * Placeholder body for product areas whose navigation and layout exist but
 * whose feature has not been built yet. Keeps every stub page visually
 * consistent instead of leaving a blank screen or a 404.
 *
 * Roadmap phase 53 — added the optional `action` slot. Before this, every
 * caller that wanted a real CTA ("Add your first vehicle") had to put it
 * outside this component entirely (usually in the page's own header),
 * identical whether the list was genuinely empty or just filtered down to
 * nothing — this lets a true zero-data state offer a direct next step.
 */
function EmptyPlaceholder({ icon: Icon, title, description, action }: EmptyPlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-4xl border border-dashed border-border py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action && (
        <Button asChild size="sm">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}

interface InlineEmptyProps {
  children: ReactNode
  className?: string
}

/**
 * Roadmap phase 51 (UI Consistency Audit) — a minimal "nothing here"
 * message for small embedded lists (a sidebar, a search dropdown)
 * where the full `EmptyPlaceholder` above (icon + title + description,
 * sized for a whole page) would be too heavy. Standardizes on
 * `text-sm text-muted-foreground` — alignment/padding stays a
 * per-caller `className`, since that genuinely varies by context (a
 * left-aligned sidebar list vs. a centered "no search results"
 * message), not arbitrary drift worth flattening away.
 */
function InlineEmpty({ children, className }: InlineEmptyProps) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
}

export { EmptyPlaceholder, InlineEmpty }
