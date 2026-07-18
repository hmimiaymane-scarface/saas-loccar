"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { createDamage, type DamageActionState } from "@/app/(dashboard)/damages/actions"
import type { Vehicle } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const initialState: DamageActionState = {}

function DamageForm({
  vehicles,
  vehicleId,
  reservationId,
  onCreated,
}: {
  vehicles: Vehicle[]
  vehicleId?: string
  reservationId?: string
  onCreated?: (damageId: string) => void
}) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(async (prev: DamageActionState, formData: FormData) => {
    const result = await createDamage(prev, formData)
    if (result.damageId) {
      if (onCreated) onCreated(result.damageId)
      else router.push(`/damages/${result.damageId}`)
    }
    return result
  }, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {reservationId && <input type="hidden" name="reservationId" value={reservationId} />}

      <Card>
        <CardHeader>
          <CardTitle>Damage details</CardTitle>
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
            <Label htmlFor="category">Category</Label>
            <NativeSelect id="category" name="category" defaultValue="bodywork" required>
              <option value="bodywork">Bodywork</option>
              <option value="glass">Glass</option>
              <option value="interior">Interior</option>
              <option value="mechanical">Mechanical</option>
              <option value="tyre">Tyre</option>
              <option value="electrical">Electrical</option>
              <option value="other">Other</option>
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="severity">Severity</Label>
            <NativeSelect id="severity" name="severity" defaultValue="minor" required>
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicleArea">Vehicle area</Label>
            <Input id="vehicleArea" name="vehicleArea" placeholder="e.g. Rear bumper" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimatedCost">Estimated cost (MAD)</Label>
            <Input id="estimatedCost" name="estimatedCost" type="number" step="0.01" min="0" />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              required
              className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              placeholder="What happened, and where exactly on the vehicle?"
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="preExisting">Timing</Label>
            <NativeSelect id="preExisting" name="preExisting" defaultValue="true">
              <option value="true">Pre-existing — was already there</option>
              <option value="false">Newly discovered — happened during this rental</option>
            </NativeSelect>
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
          Record damage
        </Button>
      </div>
    </form>
  )
}

export { DamageForm }
