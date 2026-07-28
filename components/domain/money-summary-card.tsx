import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatMad } from "@/lib/format"
import { cn } from "@/lib/utils"

interface MoneySummaryCardProps {
  rentalPriceMad: number
  /** Only shown once non-zero — an owner who never adds an extra
   * charge should never see a stray "Extras: 0 MAD" line. */
  extrasMad: number
  totalMad: number
  paidMad: number
  remainingMad: number
  depositCollectedMad: number
  /** Only shown when a real expected amount is on file — not every
   * caller has one (a brand-new reservation hasn't had "Set expected"
   * called on it yet). */
  depositExpectedMad?: number
}

function Row({ label, value, emphasize, className }: { label: string; value: string; emphasize?: boolean; className?: string }) {
  return (
    <div className={cn("flex justify-between", emphasize && "font-medium", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

/**
 * Productization wave 3 phase 24 — "the owner understands the money
 * state in one glance." Replaces the previous two-card layout (a
 * "Rental balance" card plus a separate "Deposit" card, identically
 * duplicated in both `NewRentalWizard` and `PickupWizard`) with a
 * single card the eye never has to jump between. Plain rows only — no
 * dense table, no finance jargon, deliberately no more line items than
 * the brief's own six.
 */
function MoneySummaryCard({
  rentalPriceMad,
  extrasMad,
  totalMad,
  paidMad,
  remainingMad,
  depositCollectedMad,
  depositExpectedMad,
}: MoneySummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Money</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 text-sm">
        <Row label="Rental price" value={formatMad(rentalPriceMad)} />
        {extrasMad > 0 && <Row label="Extras" value={formatMad(extrasMad)} />}
        <Row label="Total" value={formatMad(totalMad)} emphasize />
        <Separator className="my-1" />
        <Row label="Paid now" value={formatMad(paidMad)} />
        <Row
          label="Remaining"
          value={formatMad(remainingMad)}
          emphasize
          className={remainingMad > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}
        />
        {(depositCollectedMad > 0 || depositExpectedMad) && (
          <>
            <Separator className="my-1" />
            <Row
              label="Deposit"
              value={depositExpectedMad ? `${formatMad(depositCollectedMad)} of ${formatMad(depositExpectedMad)}` : formatMad(depositCollectedMad)}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

export { MoneySummaryCard }
