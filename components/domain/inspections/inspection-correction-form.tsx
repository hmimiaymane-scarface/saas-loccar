"use client"

import { useState, useTransition } from "react"
import { Loader2, Lock } from "lucide-react"

import { correctInspectionAction } from "@/app/(dashboard)/inspections/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Inspection } from "@/types/rental"

function InspectionCorrectionForm({ inspection }: { inspection: Inspection }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [odometerKm, setOdometerKm] = useState(inspection.odometerKm != null ? String(inspection.odometerKm) : "")
  const [notes, setNotes] = useState(inspection.notes ?? "")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!reason.trim()) {
      setError("A reason is required.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await correctInspectionAction(inspection.id, reason, {
        odometerKm: odometerKm ? Number(odometerKm) : undefined,
        notes: notes || undefined,
      })
      if (result.error) setError(result.error)
      else setOpen(false)
    })
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Lock />
        Correct this record
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 p-3 dark:border-amber-500/40">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correctOdometer">Odometer (km)</Label>
          <Input id="correctOdometer" type="number" value={odometerKm} onChange={(e) => setOdometerKm(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="correctNotes">Notes</Label>
        <textarea
          id="correctNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="correctionReason">Reason for correction</Label>
        <textarea
          id="correctionReason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          placeholder="Why is this being changed after completion?"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save correction
        </Button>
      </div>
    </div>
  )
}

export { InspectionCorrectionForm }
