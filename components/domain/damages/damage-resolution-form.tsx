"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { resolveDamage } from "@/app/(dashboard)/damages/actions"
import type { Damage, DamageStatus } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const STATUS_OPTIONS: { value: DamageStatus; label: string }[] = [
  { value: "under_review", label: "Under review" },
  { value: "customer_responsible", label: "Customer responsible" },
  { value: "agency_responsible", label: "Agency responsible" },
  { value: "repair_planned", label: "Repair planned" },
  { value: "repaired", label: "Repaired" },
  { value: "closed", label: "Closed" },
]

function DamageResolutionForm({ damage }: { damage: Damage }) {
  const [nextStatus, setNextStatus] = useState<DamageStatus>(
    STATUS_OPTIONS.find((o) => o.value !== damage.status)?.value ?? "under_review"
  )
  const [actualCost, setActualCost] = useState(damage.actualCostMad != null ? String(damage.actualCostMad) : "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await resolveDamage(damage.id, nextStatus, actualCost ? Number(actualCost) : undefined)
      if (result.error) setError(result.error)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolve damage</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nextStatus">Move to</Label>
          <NativeSelect
            id="nextStatus"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as DamageStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="actualCost">Actual cost (MAD)</Label>
          <Input
            id="actualCost"
            type="number"
            step="0.01"
            min="0"
            value={actualCost}
            onChange={(e) => setActualCost(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="button" onClick={submit} disabled={isPending} className="self-end">
          {isPending && <Loader2 className="animate-spin" />}
          Update status
        </Button>
      </CardContent>
    </Card>
  )
}

export { DamageResolutionForm }
