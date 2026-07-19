"use client"

import { useState } from "react"
import { Check, Pencil } from "lucide-react"

import { cn } from "@/lib/utils"
import { confidenceTier } from "@/lib/tone"
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
 * to correct them. */
function DocumentConfidenceRow({ label, value, confidence, onChange, className }: DocumentConfidenceRowProps) {
  const [editing, setEditing] = useState(confidenceTier(confidence) === "critical")
  const [draft, setDraft] = useState(value)

  function commit() {
    setEditing(false)
    if (draft !== value) onChange?.(draft)
  }

  return (
    <div className={cn("flex items-center justify-between gap-3 py-2", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        {editing ? (
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} className="h-8" />
        ) : (
          <span className="text-sm font-medium text-foreground">{value}</span>
        )}
      </div>
      <ConfidenceIndicator percent={confidence} />
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
}

export { DocumentConfidenceRow }
