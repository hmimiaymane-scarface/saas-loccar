import { CheckCircle2 } from "lucide-react"

import type { ReservationDetail } from "@/types/rental"
import { formatInTimeZone } from "@/lib/timezone"
import { Card, CardContent } from "@/components/ui/card"

interface NextReservation {
  id: string
  customerName: string
  atIso: string
}

interface ReturnCompletedBannerProps {
  reservation: ReservationDetail
  timezone: string
  nextReservation: NextReservation | null
}

/**
 * Roadmap phase 28, step 11 ("next booking shown") — mirrors phase 27's
 * `RentalStartedBanner` mechanism exactly (same `justCompleted=1` query
 * param idiom `ReturnWizard` appends to its post-completion redirect,
 * same emerald card shape). Deliberately minimal: only the facts that
 * are new at this moment (which vehicle/customer just returned, what's
 * next for the vehicle) — not a reward summary. Phase 30 ("Return
 * Completion Reward") owns the richer revenue/duration/deposit-result
 * treatment; this banner and that phase's are two separate, later-
 * composed pieces, the same split phase 18/27 already established for
 * the rental-start side.
 */
function ReturnCompletedBanner({ reservation, timezone, nextReservation }: ReturnCompletedBannerProps) {
  const nextLine = nextReservation
    ? `${nextReservation.customerName} — ${formatInTimeZone(nextReservation.atIso, timezone, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "No upcoming booking for this vehicle yet."

  return (
    <Card className="animate-in fade-in-0 slide-in-from-top-2 duration-300 border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10">
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-base font-semibold">Return complete</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Vehicle</span>
            <span className="text-sm font-medium text-foreground">
              {reservation.vehicle ? `${reservation.vehicle.make} ${reservation.vehicle.model} · ${reservation.vehicle.plate}` : "Unassigned"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Customer</span>
            <span className="text-sm font-medium text-foreground">{reservation.customer.fullName}</span>
          </div>
        </div>

        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          <span className="font-semibold">Next booking: </span>
          {nextLine}
        </p>
      </CardContent>
    </Card>
  )
}

export { ReturnCompletedBanner }
