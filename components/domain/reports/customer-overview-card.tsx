import Link from "next/link"

import type { CustomerOverviewReport } from "@/types/rental"
import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

function CustomerOverviewCard({ report }: { report: CustomerOverviewReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer overview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">New</span>
            <span className="text-lg font-semibold text-foreground">{report.newCustomers}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Returning</span>
            <span className="text-lg font-semibold text-foreground">{report.returningCustomers}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Active rental</span>
            <span className="text-lg font-semibold text-foreground">{report.activeRentalCustomers}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Owe money</span>
            <span className="text-lg font-semibold text-foreground">{report.outstandingBalanceCustomers}</span>
          </div>
        </div>

        {report.topReturning.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Most frequent returning customers</p>
            <div className="flex flex-col divide-y divide-border">
              {report.topReturning.map((c) => (
                <Link
                  key={c.customerId}
                  href={`/customers/${c.customerId}`}
                  className="flex items-center justify-between py-1.5 text-sm hover:underline"
                >
                  <span className="text-foreground">{c.fullName}</span>
                  <span className="text-muted-foreground">{c.bookingCount} bookings</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Total recorded rental value this period: {formatMad(report.totalRecordedValueMad)}</p>
      </CardContent>
    </Card>
  )
}

export { CustomerOverviewCard }
