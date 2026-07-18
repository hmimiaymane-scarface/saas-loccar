"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { createMaintenance, type MaintenanceActionState } from "@/app/(dashboard)/maintenance/actions"
import { MAINTENANCE_TYPE_LABELS } from "@/lib/status"
import type { Vehicle } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const initialState: MaintenanceActionState = {}

function MaintenanceForm({ vehicles, vehicleId }: { vehicles: Vehicle[]; vehicleId?: string }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(async (prev: MaintenanceActionState, formData: FormData) => {
    const result = await createMaintenance(prev, formData)
    if (result.maintenanceId) router.push(`/maintenance/${result.maintenanceId}`)
    return result
  }, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Maintenance details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="vehicleId">Vehicle</Label>
            <NativeSelect id="vehicleId" name="vehicleId" defaultValue={vehicleId ?? vehicles[0]?.id ?? ""} required>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.plate}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Category</Label>
            <NativeSelect id="type" name="type" defaultValue="routine_service" required>
              {Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="priority">Priority</Label>
            <NativeSelect id="priority" name="priority" defaultValue="normal" required>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <NativeSelect id="status" name="status" defaultValue="planned" required>
              <option value="planned">Planned</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress — move vehicle to maintenance now</option>
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scheduledOn">Scheduled date</Label>
            <Input id="scheduledOn" name="scheduledOn" type="date" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="odometerKm">Odometer (km)</Label>
            <Input id="odometerKm" name="odometerKm" type="number" min="0" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimatedCost">Estimated cost (MAD)</Label>
            <Input id="estimatedCost" name="estimatedCost" type="number" step="0.01" min="0" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier">Garage or supplier</Label>
            <Input id="supplier" name="supplier" />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              placeholder="What needs to be done?"
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </div>
        </CardContent>
      </Card>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save maintenance
        </Button>
      </div>
    </form>
  )
}

export { MaintenanceForm }
