import Link from "next/link"
import { ArrowDownLeft, ArrowUpRight } from "lucide-react"

import type { PaymentTransaction } from "@/types/rental"
import { formatDateTime, formatMad } from "@/lib/format"
import { ListItemCard } from "@/components/domain/list-item-card"
import { cn } from "@/lib/utils"

const TYPE_LABELS: Record<PaymentTransaction["transactionType"], string> = {
  rental_payment: "Rental payment",
  deposit_collection: "Deposit collected",
  deposit_return: "Deposit returned",
  refund: "Refund",
  damage_charge: "Damage charge",
  additional_charge: "Additional charge",
}

function PaymentListItem({ payment }: { payment: PaymentTransaction }) {
  const isIn = payment.direction === "in"
  return (
    <ListItemCard className="flex items-center gap-3">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          isIn
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400"
        )}
      >
        {isIn ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{TYPE_LABELS[payment.transactionType]}</span>
          <span className="text-xs text-muted-foreground capitalize">{payment.method}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{payment.customerName}</span>
          {payment.reservationId && (
            <>
              <span>·</span>
              <Link href={`/reservations/${payment.reservationId}`} className="text-primary hover:underline">
                {payment.reservationReference}
              </Link>
            </>
          )}
          <span>·</span>
          <span>{formatDateTime(payment.paidAt)}</span>
        </div>
      </div>
      <span className={cn("shrink-0 text-sm font-semibold", isIn ? "text-emerald-700 dark:text-emerald-400" : "text-orange-700 dark:text-orange-400")}>
        {isIn ? "+" : "-"}
        {formatMad(payment.amountMad)}
      </span>
    </ListItemCard>
  )
}

export { PaymentListItem }
