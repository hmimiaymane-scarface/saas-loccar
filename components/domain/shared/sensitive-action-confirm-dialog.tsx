"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

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

/**
 * Roadmap phase 17 requirement 4 — the shared confirm-with-reason
 * pattern for sensitive operations (blacklisting a customer, refunding
 * a deposit, amending a signed contract, ...). Modeled directly on
 * ContractLifecycleActions' cancel-contract dialog (the one place this
 * pattern already existed), generalized so every sensitive action
 * reuses one component instead of re-implementing the textarea +
 * pending/error state each time. The reason is required here — unlike
 * the contract-cancel dialog this was lifted from, which defaults to
 * "No reason given." — because these are exactly the operations the
 * phase brief calls out as needing an actual reason on record, not an
 * optional one.
 */
export function SensitiveActionConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  reasonPlaceholder = "Reason…",
  onConfirm,
  onSuccess,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  confirmLabel: string
  reasonPlaceholder?: string
  onConfirm: (reason: string) => Promise<{ error?: string } | void>
  onSuccess?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const trimmedReason = reason.trim()

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setReason("")
      setError(null)
    }
  }

  function confirm() {
    if (trimmedReason === "") return
    setError(null)
    startTransition(async () => {
      const result = await onConfirm(trimmedReason)
      if (result && result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      setReason("")
      onSuccess?.()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPlaceholder}
          rows={3}
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              confirm()
            }}
            disabled={isPending || trimmedReason === ""}
          >
            {isPending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
