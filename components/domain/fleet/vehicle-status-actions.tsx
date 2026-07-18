"use client"

import { useState, useTransition } from "react"
import { Wrench, Ban, CheckCircle2, Loader2 } from "lucide-react"

import { updateVehicleStatus } from "@/app/(dashboard)/fleet/actions"
import { Button } from "@/components/ui/button"
import type { VehicleStatus } from "@/types/rental"

function VehicleStatusActions({ vehicleId, status }: { vehicleId: string; status: VehicleStatus }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function change(next: VehicleStatus) {
    setError(null)
    startTransition(async () => {
      const result = await updateVehicleStatus(vehicleId, next)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {status !== "maintenance" && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => change("maintenance")}>
            {isPending ? <Loader2 className="animate-spin" /> : <Wrench />}
            Send to maintenance
          </Button>
        )}
        {status !== "unavailable" && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => change("unavailable")}>
            <Ban />
            Mark unavailable
          </Button>
        )}
        {(status === "maintenance" || status === "unavailable") && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => change("available")}>
            <CheckCircle2 />
            Return to service
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { VehicleStatusActions }
