import { CheckCircle2, AlertTriangle } from "lucide-react"

import type { ValidationIssue } from "@/lib/contracts/validation"
import { StatusBadge, type StatusVisual } from "@/components/domain/status-badge"

const READY_VISUAL: StatusVisual = {
  label: "Ready to generate",
  icon: CheckCircle2,
  dot: "bg-emerald-500",
  badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
}

const NEEDS_REVIEW_VISUAL: StatusVisual = {
  label: "Needs review",
  icon: AlertTriangle,
  dot: "bg-amber-500",
  badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
}

/**
 * Roadmap phase 26 — "ready / needs review" visible on the reservation
 * page itself, before a contract has even been generated, with the
 * specific blocking reasons listed right there — the "clear
 * missing-data explanation" the brief asks for, without a navigation.
 * Not a `ContractStatusBadge` — that's an existing contract's lifecycle
 * stage; this is a pre-generation readiness check, a different concept.
 */
function ContractReadinessBadge({ ready, issues }: { ready: boolean; issues: ValidationIssue[] }) {
  return (
    <div className="flex flex-col gap-2">
      <StatusBadge visual={ready ? READY_VISUAL : NEEDS_REVIEW_VISUAL} />
      {!ready && issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { ContractReadinessBadge }
