import { Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import type { InlineNudge } from "@/lib/mobile/inline-nudges"

/** Roadmap phase 16 requirement 7 — proactive nudges shown inline
 * during the wizard, not a separate chat surface (the bible's own
 * framing: "Mobile AI assists," it doesn't wait to be asked). Reuses
 * the same Sparkles-marked "AI-adjacent" visual language as
 * MorningBriefing (phase 13) for consistency, but these are quieter —
 * no accept/dismiss, since nothing here is a proposal to act on, just
 * a heads-up. */
function InlineNudgeList({ nudges }: { nudges: InlineNudge[] }) {
  if (nudges.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      {nudges.map((nudge) => (
        <p
          key={nudge.id}
          className={cn(
            "flex items-start gap-1.5 rounded-2xl px-3 py-2 text-xs",
            nudge.tone === "warning"
              ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Sparkles className="mt-0.5 size-3.5 shrink-0" />
          {nudge.message}
        </p>
      ))}
    </div>
  )
}

export { InlineNudgeList }
