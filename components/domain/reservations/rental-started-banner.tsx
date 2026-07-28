import { CheckCircle2 } from "lucide-react"

import type { ReservationDetail } from "@/types/rental"
import { formatMad } from "@/lib/format"
import { formatInTimeZone } from "@/lib/timezone"
import { Card, CardContent } from "@/components/ui/card"

interface RentalStartedBannerProps {
  reservation: ReservationDetail
  timezone: string
  hasContract: boolean
}

/**
 * Roadmap phase 27 — "give clear closure and confidence" right after
 * activation, before the owner has to go hunting through the rest of
 * the reservation page for the same facts. Shown once, gated by the
 * `justActivated` query param `PickupWizard` appends to its
 * post-activation redirect — not a new route, since every fact here
 * already belongs to this page; the banner is a summarized, confident
 * framing of it, not new data.
 */
function RentalStartedBanner({ reservation, timezone, hasContract }: RentalStartedBannerProps) {
  const returnLabel = formatInTimeZone(reservation.returnAt, timezone, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

  const nextAction =
    reservation.payment.remainingMad > 0
      ? `Collect the remaining ${formatMad(reservation.payment.remainingMad)}.`
      : !hasContract
        ? "Generate the rental contract."
        : `Nothing else needed until the return on ${returnLabel}.`

  return (
    <Card className="border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10">
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-base font-semibold">Rental started</p>
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
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Return</span>
            <span className="text-sm font-medium text-foreground">{returnLabel}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Paid / Remaining</span>
            <span className="text-sm font-medium text-foreground">
              {formatMad(reservation.payment.amountPaidMad)} / {formatMad(reservation.payment.remainingMad)}
            </span>
          </div>
        </div>

        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          <span className="font-semibold">Next: </span>
          {nextAction}
        </p>
      </CardContent>
    </Card>
  )
}

export { RentalStartedBanner }
