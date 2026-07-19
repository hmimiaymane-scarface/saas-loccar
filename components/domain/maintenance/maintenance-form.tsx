"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle } from "lucide-react"

import { createMaintenance, fetchVehicleConflicts, type MaintenanceActionState } from "@/app/(dashboard)/maintenance/actions"
import { MAINTENANCE_TYPE_LABELS } from "@/lib/status"
import { formatDate } from "@/lib/format"
import type { ReservationConflict, Vehicle } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

const initialState: MaintenanceActionState = {}

function MaintenanceForm({ vehicles, vehicleId }: { vehicles: Vehicle[]; vehicleId?: string }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(async (prev: MaintenanceActionState, formData: FormData) => {
    const result = await createMaintenance(prev, formData)
    if (result.maintenanceId) router.push(`/maintenance/${result.maintenanceId}`)
    return result
  }, initialState)

  const vehicleRef = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    vehicleRef.current?.focus()
  }, [])

  // Only the vehicle is controlled — it's what drives the live conflict
  // lookup below. Everything else stays uncontrolled (defaultValue), same
  // as the rest of this codebase's simple forms.
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicleId ?? vehicles[0]?.id ?? "")
  const [status, setStatus] = useState("planned")

  // The vehicle's current odometer as a starting reference — still just a
  // default, always editable, refreshed whenever the vehicle changes.
  const [odometerKm, setOdometerKm] = useState(() => {
    const initial = vehicles.find((v) => v.id === selectedVehicleId)
    return initial ? String(initial.mileageKm) : ""
  })
  const isFirstVehicleRender = useRef(true)
  useEffect(() => {
    if (isFirstVehicleRender.current) {
      isFirstVehicleRender.current = false
      return
    }
    const vehicle = vehicles.find((v) => v.id === selectedVehicleId)
    const timeout = setTimeout(() => setOdometerKm(vehicle ? String(vehicle.mileageKm) : ""), 0)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `vehicles` is stable per page load
  }, [selectedVehicleId])

  // Reservation conflicts are shown automatically once the vehicle is
  // known — never used to silently change anything, just information
  // surfaced before the user confirms.
  const [conflicts, setConflicts] = useState<ReservationConflict[]>([])
  const [conflictsLoading, setConflictsLoading] = useState(false)
  const [, startConflictFetch] = useTransition()

  useEffect(() => {
    if (!selectedVehicleId) return
    const timeout = setTimeout(() => {
      setConflictsLoading(true)
      startConflictFetch(async () => {
        const result = await fetchVehicleConflicts(selectedVehicleId)
        setConflicts(result)
        setConflictsLoading(false)
      })
    }, 0)
    return () => clearTimeout(timeout)
  }, [selectedVehicleId])

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Vehicle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicleId">Vehicle</Label>
            <NativeSelect
              ref={vehicleRef}
              id="vehicleId"
              name="vehicleId"
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              required
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.plate}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reason</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <NativeSelect id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)} required>
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
            <Input
              id="odometerKm"
              name="odometerKm"
              type="number"
              min="0"
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Defaulted to the vehicle&apos;s current odometer.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Garage &amp; cost</CardTitle>
          <CardDescription>Optional — you can fill these in later.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier">Garage or supplier</Label>
            <Input id="supplier" name="supplier" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimatedCost">Estimated cost (MAD)</Label>
            <Input id="estimatedCost" name="estimatedCost" type="number" step="0.01" min="0" />
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

      {selectedVehicleId && (conflictsLoading || conflicts.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Reservation conflicts</CardTitle>
            <CardDescription>
              {status === "in_progress"
                ? "This vehicle will move to maintenance now — these upcoming reservations are affected."
                : "Upcoming reservations for this vehicle. Nothing is changed automatically."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {conflictsLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Checking upcoming reservations…
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {conflicts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      {c.reference} — {c.customerName}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(c.pickupAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending || !selectedVehicleId}>
          {isPending && <Loader2 className="animate-spin" />}
          Confirm maintenance
        </Button>
      </div>
    </form>
  )
}

export { MaintenanceForm }
