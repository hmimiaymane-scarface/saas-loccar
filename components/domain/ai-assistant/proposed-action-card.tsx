"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Check, X, Sparkles } from "lucide-react"

import { confirmProposedAction, rejectProposedAction } from "@/app/(dashboard)/ai-assistant/actions"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type LocalStatus = "pending" | "confirming" | "rejecting" | "confirmed" | "rejected" | "error"

interface ProposedActionCardProps {
  proposalId: string
  summary: string
  initialStatus?: LocalStatus
}

/** One proposal the assistant prepared — never anything that already
 * happened. Confirm calls the exact same server action a human clicking
 * the equivalent button elsewhere in the app would call; this card only
 * ever reflects what that action reports back. */
function ProposedActionCard({ proposalId, summary, initialStatus = "pending" }: ProposedActionCardProps) {
  const router = useRouter()
  const [status, setStatus] = useState<LocalStatus>(initialStatus)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setStatus("confirming")
    setError(null)
    const result = await confirmProposedAction(proposalId)
    if (result.error) {
      setStatus("error")
      setError(result.error)
      return
    }
    setStatus("confirmed")
    router.refresh()
  }

  async function reject() {
    setStatus("rejecting")
    setError(null)
    const result = await rejectProposedAction(proposalId)
    if (result.error) {
      setStatus("error")
      setError(result.error)
      return
    }
    setStatus("rejected")
  }

  const resolved = status === "confirmed" || status === "rejected"

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-3xl border p-3.5 text-sm",
        status === "confirmed" && "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
        status === "rejected" && "border-border bg-muted/50 opacity-70",
        (status === "pending" || status === "confirming" || status === "rejecting" || status === "error") &&
          "border-primary/20 bg-primary/5"
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-foreground">{summary}</p>
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {!resolved && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reject}
            disabled={status === "confirming" || status === "rejecting"}
          >
            {status === "rejecting" ? <Loader2 className="animate-spin" /> : <X />}
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={confirm}
            disabled={status === "confirming" || status === "rejecting"}
          >
            {status === "confirming" ? <Loader2 className="animate-spin" /> : <Check />}
            Confirm
          </Button>
        </div>
      )}
      {status === "confirmed" && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-3.5" /> Done.
        </p>
      )}
      {status === "rejected" && <p className="text-xs text-muted-foreground">Rejected — nothing changed.</p>}
    </div>
  )
}

export { ProposedActionCard }
