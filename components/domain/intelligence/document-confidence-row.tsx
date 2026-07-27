"use client"

import { forwardRef, useState } from "react"
import { Check, Pencil, CheckCircle2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { confidenceTier, toneClasses } from "@/lib/tone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfidenceIndicator } from "@/components/domain/intelligence/confidence-indicator"

interface DocumentConfidenceRowProps {
  label: string
  value: string
  /** 0-100 */
  confidence: number
  onChange?: (value: string) => void
  className?: string
}

/** One OCR-extracted field: label, value, confidence, and an
 * accept-or-correct affordance (bible Chapter 7 §6 — "fields with lower
 * confidence require verification, fields with very high confidence
 * continue automatically"). Low-confidence fields start open for
 * editing; high-confidence ones stay read-only until the user chooses
 * to correct them.
 *
 * Productization wave 3 phase 22 — forwards a ref to the row's
 * wrapping div so a parent can `scrollIntoView` a specific uncertain
 * field ("jump directly between uncertain fields"); a critical-tier
 * row gets its own highlighted container (not just an open input) so
 * it reads as needing attention even before you look at the value;
 * a positive-tier row shows a quiet "Accepted" label instead of
 * `ConfidenceIndicator`'s percentage — that shared component's own
 * rendering is untouched (it's also used outside document scanning),
 * this is a local override in this row's own JSX. */
const DocumentConfidenceRow = forwardRef<HTMLDivElement, DocumentConfidenceRowProps>(function DocumentConfidenceRow(
  { label, value, confidence, onChange, className },
  ref
) {
  const tier = confidenceTier(confidence)
  const [editing, setEditing] = useState(tier === "critical")
  const [draft, setDraft] = useState(value)

  function commit() {
    setEditing(false)
    if (draft !== value) onChange?.(draft)
  }

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        tier === "critical" && "-mx-3 rounded-xl border-l-4 border-red-400 bg-red-50/60 px-3 dark:border-red-500/60 dark:bg-red-500/10",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        {editing ? (
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} className="h-8" />
        ) : (
          <span className="text-sm font-medium text-foreground">{value}</span>
        )}
      </div>
      {tier === "positive" ? (
        <span className={cn("inline-flex items-center gap-1 text-xs", toneClasses.positive.text)}>
          <CheckCircle2 className="size-3.5" />
          Accepted
        </span>
      ) : (
        <ConfidenceIndicator percent={confidence} />
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => (editing ? commit() : setEditing(true))}
        aria-label={editing ? "Accept value" : "Correct value"}
      >
        {editing ? <Check className="size-4" /> : <Pencil className="size-4" />}
      </Button>
    </div>
  )
})

export { DocumentConfidenceRow }
