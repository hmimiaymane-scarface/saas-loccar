"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"

import {
  startMaintenanceAction,
  completeMaintenanceAction,
  cancelMaintenanceAction,
} from "@/app/(dashboard)/maintenance/actions"
import type { MaintenanceRecord, ReservationConflict, VehicleStatus } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Checkbox } from "@/components/ui/checkbox"
import { SubmitButton } from "@/components/ui/submit-button"
import { useSlowPending } from "@/hooks/use-slow-pending"

const OUTCOME_OPTIONS: { value: VehicleStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "maintenance", label: "Still in maintenance" },
  { value: "unavailable", label: "Unavailable" },
]

type Mode = "complete" | "cancel" | null

function MaintenanceDetailActions({
  record,
  conflicts,
}: {
  record: MaintenanceRecord
  conflicts: ReservationConflict[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)
  const [isPending, startTransition] = useTransition()
  const isSlowPending = useSlowPending(isPending)
  const [error, setError] = useState<string | null>(null)
  // Only one of start/complete/cancel is ever the "active" action for a
  // given mode (see render below), so one shared status computation is
  // safe -- no risk of one action's error bleeding into another's button.
  const status = isPending ? (isSlowPending ? "slow" : "pending") : error ? "error" : "idle"
  const [actualCost, setActualCost] = useState(record.estimatedCostMad != null ? String(record.estimatedCostMad) : "")
  const [nextServiceOn, setNextServiceOn] = useState("")
  const [nextServiceOdometerKm, setNextServiceOdometerKm] = useState("")
  const [vehicleOutcome, setVehicleOutcome] = useState<VehicleStatus>("available")
  const [createExpense, setCreateExpense] = useState(true)

  const canStart = record.status === "planned" || record.status === "scheduled"
  const isOccupying = record.status === "in_progress" || record.status === "waiting_for_parts"
  const canCancel = record.status !== "completed" && record.status !== "cancelled"

  function start() {
    setError(null)
    startTransition(async () => {
      const result = await startMaintenanceAction(record.id, record.vehicleId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function complete() {
    setError(null)
    startTransition(async () => {
      const result = await completeMaintenanceAction(record.id, record.vehicleId, vehicleOutcome, {
        actualCost: actualCost ? Number(actualCost) : undefined,
        nextServiceOn: nextServiceOn || undefined,
        nextServiceOdometerKm: nextServiceOdometerKm ? Number(nextServiceOdometerKm) : undefined,
        createExpense,
      })
      if (result.error) setError(result.error)
      else {
        setMode(null)
        router.refresh()
      }
    })
  }

  function cancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelMaintenanceAction(record.id, record.vehicleId, isOccupying ? vehicleOutcome : undefined)
      if (result.error) setError(result.error)
      else {
        setMode(null)
        router.refresh()
      }
    })
  }

  if (!canStart && !canCancel) return null

  return (
    <div className="flex flex-col gap-3">
      {canStart && conflicts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-3.5" />
            {conflicts.length} upcoming reservation{conflicts.length === 1 ? "" : "s"} for this vehicle
          </p>
          <p>Starting maintenance won&apos;t cancel these — reassign the vehicle or contact the customer first.</p>
          <div className="flex flex-col gap-1">
            {conflicts.map((c) => (
              <Link key={c.id} href={`/reservations/${c.id}`} className="hover:underline">
                {c.reference} · {c.customerName}
              </Link>
            ))}
          </div>
        </div>
      )}

      {mode === null && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {canStart && (
              <SubmitButton type="button" onClick={start} status={status}>
                Start now
              </SubmitButton>
            )}
            {isOccupying && (
              <Button type="button" onClick={() => setMode("complete")} disabled={isPending}>
                Complete
              </Button>
            )}
            {canCancel && (
              <Button type="button" variant="outline" onClick={() => setMode("cancel")} disabled={isPending}>
                Cancel
              </Button>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {mode === "complete" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="actualCost">Actual cost (MAD)</Label>
              <Input id="actualCost" type="number" step="0.01" min="0" value={actualCost} onChange={(e) => setActualCost(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vehicleOutcome">Return vehicle to</Label>
              <NativeSelect id="vehicleOutcome" value={vehicleOutcome} onChange={(e) => setVehicleOutcome(e.target.value as VehicleStatus)}>
                {OUTCOME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nextServiceOn">Next service date</Label>
              <Input id="nextServiceOn" type="date" value={nextServiceOn} onChange={(e) => setNextServiceOn(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nextServiceOdometerKm">Next service odometer (km)</Label>
              <Input
                id="nextServiceOdometerKm"
                type="number"
                min="0"
                value={nextServiceOdometerKm}
                onChange={(e) => setNextServiceOdometerKm(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={createExpense} onChange={(e) => setCreateExpense(e.target.checked)} />
            Record this cost as an expense
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <SubmitButton type="button" size="sm" onClick={complete} status={status}>
              Mark completed
            </SubmitButton>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
          {isOccupying && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cancelOutcome">Return vehicle to</Label>
              <NativeSelect id="cancelOutcome" value={vehicleOutcome} onChange={(e) => setVehicleOutcome(e.target.value as VehicleStatus)}>
                {OUTCOME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)}>
              Back
            </Button>
            <SubmitButton type="button" size="sm" variant="destructive" onClick={cancel} status={status}>
              Confirm cancel
            </SubmitButton>
          </div>
        </div>
      )}
    </div>
  )
}

export { MaintenanceDetailActions }
