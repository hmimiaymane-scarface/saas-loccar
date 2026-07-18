import type { LucideIcon } from "lucide-react"

interface EmptyPlaceholderProps {
  icon: LucideIcon
  title: string
  description: string
}

/**
 * Placeholder body for product areas whose navigation and layout exist but
 * whose feature has not been built yet. Keeps every stub page visually
 * consistent instead of leaving a blank screen or a 404.
 */
function EmptyPlaceholder({ icon: Icon, title, description }: EmptyPlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-4xl border border-dashed border-border py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export { EmptyPlaceholder }
