"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { updateReservationStatus } from "@/app/(dashboard)/reservations/actions"
import { allowedNextStatuses, actionLabelFor } from "@/lib/reservations/status"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import type { BookingStatus } from "@/types/rental"

const DESTRUCTIVE: BookingStatus[] = ["cancelled", "no_show"]

function ReservationStatusActions({
  reservationId,
  status,
}: {
  reservationId: string
  status: BookingStatus
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const next = allowedNextStatuses(status)

  function apply(nextStatus: BookingStatus) {
    setError(null)
    startTransition(async () => {
      const result = await updateReservationStatus(reservationId, nextStatus)
      if (result.error) setError(result.error)
    })
  }

  if (next.length === 0) {
    return <p className="text-sm text-muted-foreground">No further actions — this reservation is closed.</p>
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {next.map((nextStatus) =>
          DESTRUCTIVE.includes(nextStatus) ? (
            <AlertDialog key={nextStatus}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  {actionLabelFor(nextStatus)}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{actionLabelFor(nextStatus)}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can&apos;t be undone from here.
                    {status === "active"
                      ? " The vehicle will become available again."
                      : " The customer will need a new reservation if this changes."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep reservation</AlertDialogCancel>
                  <AlertDialogAction onClick={() => apply(nextStatus)}>
                    {actionLabelFor(nextStatus)}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button key={nextStatus} size="sm" disabled={isPending} onClick={() => apply(nextStatus)}>
              {isPending && <Loader2 className="animate-spin" />}
              {actionLabelFor(nextStatus)}
            </Button>
          )
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { ReservationStatusActions }
