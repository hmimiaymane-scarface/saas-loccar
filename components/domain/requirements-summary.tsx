import { AlertCircle, CheckCircle2 } from "lucide-react"

import type { RequirementItem } from "@/lib/workflow/steps"

/** Persistent "what's still left" strip for a guided flow — always
 * visible, not tucked into a single review step, so the user never has
 * to wonder what's still missing. */
function RequirementsSummary({ items }: { items: RequirementItem[] }) {
  const remaining = items.filter((item) => !item.done)

  if (remaining.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
        <CheckCircle2 className="size-4 shrink-0" />
        Everything&apos;s ready.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-muted/50 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <AlertCircle className="size-4 shrink-0 text-muted-foreground" />
        {remaining.length} thing{remaining.length === 1 ? "" : "s"} left
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {remaining.map((item) => (
          <li key={item.label}>{item.label}</li>
        ))}
      </ul>
    </div>
  )
}

export { RequirementsSummary }
