import Link from "next/link"
import { Phone, ShieldCheck, ShieldAlert, CarFront, History, AlertTriangle } from "lucide-react"

import type { Customer, CustomerCardContext } from "@/types/rental"
import { initials, formatDate, formatMad } from "@/lib/format"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

/**
 * Productization wave 2 phase 16 — "customer pages feel like rental
 * tools, not generic CRM profiles." Replaces the old name/phone/
 * licence-expiry row with the brief's own field list, plus 3 real
 * actions (Call, New rental, History) instead of the whole row being
 * one bare link to the detail page. A WhatsApp action is deliberately
 * not added — no integration exists anywhere in this codebase yet
 * (the brief says "later," not now), and this app never ships a
 * button for a channel that isn't actually wired up.
 */
function rentalLine(context: CustomerCardContext | undefined): string | null {
  if (!context) return null
  if (context.currentRental) {
    return `Renting now${context.currentRental.vehicleLabel ? ` — ${context.currentRental.vehicleLabel}` : ""}, back ${formatDate(context.currentRental.returnAtIso)}`
  }
  if (context.lastRentalAtIso) {
    return `Last rental: ${formatDate(context.lastRentalAtIso)}`
  }
  return "No rentals yet"
}

function CustomerListItem({ customer, context }: { customer: Customer; context?: CustomerCardContext }) {
  const line = rentalLine(context)

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Avatar size="sm">
          <AvatarFallback>{initials(customer.fullName)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-medium text-foreground">{customer.fullName}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="size-3 shrink-0" />
            {customer.phone}
          </div>
        </div>
        {context && (
          <div
            className={
              context.verifiedIdentity
                ? "flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                : "flex shrink-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
            }
          >
            {context.verifiedIdentity ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
            {context.verifiedIdentity ? "Verified" : "Not verified"}
          </div>
        )}
      </div>

      {line && <p className="text-xs text-muted-foreground">{line}</p>}

      {context && context.outstandingBalanceMad > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5" />
          Owes {formatMad(context.outstandingBalanceMad)}
        </p>
      )}

      {context?.trustSignal && <p className="text-xs font-medium text-red-700 dark:text-red-400">{context.trustSignal}</p>}

      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={`tel:${customer.phone}`}>
            <Phone />
            Call
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/reservations/new?customerId=${customer.id}`}>
            <CarFront />
            New rental
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/customers/${customer.id}`}>
            <History />
            History
          </Link>
        </Button>
      </div>
    </div>
  )
}

export { CustomerListItem }
