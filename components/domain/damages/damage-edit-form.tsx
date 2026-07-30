"use client"

import { useActionState, useState } from "react"
import { Loader2, Pencil } from "lucide-react"

import { updateDamage, type DamageActionState } from "@/app/(dashboard)/damages/actions"
import type { Damage } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"

const initialState: DamageActionState = {}

function DamageEditForm({ damage }: { damage: Damage }) {
  const [open, setOpen] = useState(false)
  const action = updateDamage.bind(null, damage.id)
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
          <Label htmlFor="category">Category</Label>
          <NativeSelect id="category" name="category" defaultValue={damage.category} required>
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
          <NativeSelect id="severity" name="severity" defaultValue={damage.severity} required>
            <option value="minor">Minor</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vehicleArea">Vehicle area</Label>
          <Input id="vehicleArea" name="vehicleArea" defaultValue={damage.vehicleArea} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estimatedCost">Estimated cost (MAD)</Label>
          <Input
            id="estimatedCost"
            name="estimatedCost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={damage.estimatedCostMad ?? undefined}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} required defaultValue={damage.description} />
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

export { DamageEditForm }
