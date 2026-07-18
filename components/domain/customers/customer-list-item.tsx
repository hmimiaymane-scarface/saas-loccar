import Link from "next/link"
import { Phone, AlertTriangle } from "lucide-react"

import type { Customer } from "@/types/rental"
import { initials, formatDate } from "@/lib/format"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

function CustomerListItem({ customer }: { customer: Customer }) {
  const licenseExpired = customer.licenseExpiresAt ? new Date(customer.licenseExpiresAt) < new Date() : false

  return (
    <Link
      href={`/customers/${customer.id}`}
      className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
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
      {customer.licenseExpiresAt && (
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className={licenseExpired ? "flex items-center gap-1 text-xs text-red-600 dark:text-red-400" : "text-xs text-muted-foreground"}>
            {licenseExpired && <AlertTriangle className="size-3" />}
            Licence {formatDate(customer.licenseExpiresAt)}
          </span>
        </div>
      )}
    </Link>
  )
}

export { CustomerListItem }
