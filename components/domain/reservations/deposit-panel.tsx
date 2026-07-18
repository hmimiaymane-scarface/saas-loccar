"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { setExpectedDeposit, collectDeposit, returnDeposit, retainDeposit } from "@/app/(dashboard)/payments/actions"
import type { Deposit, PaymentMethod } from "@/types/rental"
import { depositStatusConfig } from "@/lib/status"
import { depositHeldMad } from "@/lib/deposits"
import { formatMad } from "@/lib/format"
import { StatusBadge } from "@/components/domain/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"

type Mode = "expected" | "collect" | "return" | "retain" | null

function DepositPanel({
  reservationId,
  deposit,
  canCollect,
  canResolve,
}: {
  reservationId: string
  deposit: Deposit | null
  canCollect: boolean
  canResolve: boolean
}) {
  const [mode, setMode] = useState<Mode>(null)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const held = deposit ? depositHeldMad(deposit) : 0

  function reset() {
    setMode(null)
    setAmount("")
    setNotes("")
    setError(null)
  }

  function submit() {
    const value = Number(amount)
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError("Enter a valid amount.")
      return
    }
    setError(null)
    startTransition(async () => {
      let result: { error?: string }
      if (mode === "expected") result = await setExpectedDeposit(reservationId, value)
      else if (mode === "collect") result = await collectDeposit(reservationId, value, method)
      else if (mode === "return") result = await returnDeposit(reservationId, value, method, notes || undefined)
      else result = await retainDeposit(reservationId, value, notes)

      if (result.error) setError(result.error)
      else reset()
    })
  }

  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Status</span>
        <StatusBadge visual={depositStatusConfig[deposit?.status ?? "not_required"]} />
      </div>
      <Separator />
      <div className="flex justify-between">
        <span className="text-muted-foreground">Expected</span>
        <span className="text-foreground">{formatMad(deposit?.expectedMad ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Collected</span>
        <span className="text-foreground">{formatMad(deposit?.collectedMad ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Returned</span>
        <span className="text-foreground">{formatMad(deposit?.returnedMad ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Retained</span>
        <span className="text-foreground">{formatMad(deposit?.retainedMad ?? 0)}</span>
      </div>
      <div className="flex justify-between font-medium">
        <span className="text-muted-foreground">Currently held</span>
        <span className="text-foreground">{formatMad(held)}</span>
      </div>

      {mode ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border p-2.5">
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Amount (MAD)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {(mode === "collect" || mode === "return") && (
            <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Transfer</option>
              <option value="other">Other</option>
            </NativeSelect>
          )}
          {(mode === "return" || mode === "retain") && (
            <Input
              placeholder={mode === "retain" ? "Reason for retaining (required)" : "Notes (optional)"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={submit} disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Confirm
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {canCollect && (
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("expected")}>
              Set expected
            </Button>
          )}
          {canCollect && (
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("collect")}>
              Collect
            </Button>
          )}
          {canResolve && held > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("return")}>
              Return
            </Button>
          )}
          {canResolve && held > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("retain")}>
              Retain
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export { DepositPanel }
