"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import {
  prepareContractAction,
  sendContractForSignatureAction,
  activateContractAction,
  completeContractAction,
  archiveContractAction,
  cancelContractAction,
} from "@/app/(dashboard)/contract-templates/actions"
import { allowedNextContractStatuses, contractActionLabelFor, isManualTransition, type ContractStatus } from "@/lib/contracts/lifecycle"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"

const ACTION_FOR: Partial<Record<ContractStatus, (contractId: string) => Promise<{ ok: true } | { ok: false; error: string }>>> = {
  prepared: prepareContractAction,
  awaiting_signature: sendContractForSignatureAction,
  active: activateContractAction,
  completed: completeContractAction,
  archived: archiveContractAction,
}

/** Roadmap phase 11 requirement 3 — one button per allowed transition,
 * driven entirely by `allowedNextContractStatuses` (never a
 * hand-written list that could drift from the real state machine).
 * "Signed" is deliberately never offered here — it only happens as a
 * side effect of collecting the required signatures (see
 * `ContractSignatureSection`), not a click of its own. */
function ContractLifecycleActions({ contractId, status }: { contractId: string; status: ContractStatus }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const next = allowedNextContractStatuses(status).filter(isManualTransition)

  function apply(nextStatus: ContractStatus) {
    setError(null)
    startTransition(async () => {
      const action = ACTION_FOR[nextStatus]
      if (!action) return
      const result = await action(contractId)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  function applyCancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelContractAction(contractId, cancelReason.trim() || "No reason given.")
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  if (next.length === 0) {
    return <p className="text-sm text-muted-foreground">No further lifecycle actions from this state.</p>
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {next.map((nextStatus) =>
          nextStatus === "cancelled" ? (
            <AlertDialog key={nextStatus}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  Cancel contract
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this contract?</AlertDialogTitle>
                  <AlertDialogDescription>This can&apos;t be undone from here. A reason is recorded on the contract.</AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for cancelling…"
                  rows={3}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep contract</AlertDialogCancel>
                  <AlertDialogAction onClick={applyCancel}>Cancel contract</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button key={nextStatus} size="sm" disabled={isPending} onClick={() => apply(nextStatus)}>
              {isPending && <Loader2 className="animate-spin" />}
              {contractActionLabelFor(nextStatus)}
            </Button>
          )
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { ContractLifecycleActions }
