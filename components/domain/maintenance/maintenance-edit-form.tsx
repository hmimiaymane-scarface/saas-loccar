"use client"

import { useActionState, useState } from "react"
import { Loader2, Pencil } from "lucide-react"

import { updateMaintenance, type MaintenanceActionState } from "@/app/(dashboard)/maintenance/actions"
import { MAINTENANCE_TYPE_LABELS } from "@/lib/status"
import type { MaintenanceRecord } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"

const initialState: MaintenanceActionState = {}

function MaintenanceEditForm({ record }: { record: MaintenanceRecord }) {
  const [open, setOpen] = useState(false)
  const action = updateMaintenance.bind(null, record.id)
  const [state, formAction, isPending] = useActionState(action, initialState)

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil />
        Edit details
      </Button>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Category</Label>
          <NativeSelect id="type" name="type" defaultValue={record.type} required>
            {Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priority">Priority</Label>
          <NativeSelect id="priority" name="priority" defaultValue={record.priority} required>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scheduledOn">Scheduled date</Label>
          <Input id="scheduledOn" name="scheduledOn" type="date" defaultValue={record.scheduledOn ?? undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="odometerKm">Odometer (km)</Label>
          <Input id="odometerKm" name="odometerKm" type="number" min="0" defaultValue={record.odometerKm ?? undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estimatedCost">Estimated cost (MAD)</Label>
          <Input
            id="estimatedCost"
            name="estimatedCost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={record.estimatedCostMad ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier">Garage or supplier</Label>
          <Input id="supplier" name="supplier" defaultValue={record.supplier ?? undefined} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={record.description ?? undefined}
          className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={record.notes ?? undefined}
          className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  )
}

export { MaintenanceEditForm }
