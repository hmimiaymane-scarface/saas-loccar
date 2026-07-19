import Link from "next/link"

import { getPlatformCompaniesList } from "@/lib/platform-data"
import { subscriptionStatusConfig } from "@/lib/platform-status"
import { isTrialEndingSoon } from "@/lib/platform/subscription-rules"
import { formatDate, formatRelativeTime } from "@/lib/format"
import type { SubscriptionStatus } from "@/types/platform"
import { CompanyFilters } from "@/components/domain/platform/company-filters"
import { PaginationBar } from "@/components/domain/pagination-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function PlatformCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; sort?: string; page?: string }>
}) {
  const params = await searchParams
  const page = params.page ? Math.max(1, Number(params.page)) : 1
  const pageSize = 25

  const result = await getPlatformCompaniesList(
    {
      search: params.search,
      status: params.status as SubscriptionStatus | undefined,
      sort: params.sort === "created_at" ? "created_at" : "activity",
    },
    page,
    pageSize
  )
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium text-foreground">Companies</h1>
        <p className="text-sm text-muted-foreground">
          {result.total} compan{result.total === 1 ? "y" : "ies"}
        </p>
      </div>

      <CompanyFilters />

      <Card>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {result.items.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No companies match your filters.</p>
          ) : (
            result.items.map((c) => (
              <Link
                key={c.companyId}
                href={`/platform/companies/${c.companyId}`}
                className="flex flex-col gap-2 px-6 py-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.city ?? "—"} · {c.ownerEmail ?? "no owner on record"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:justify-end">
                  <span>{c.vehicleCount} vehicles</span>
                  <span>{c.reservationCount} reservations</span>
                  <span>{c.lastActivityAt ? formatRelativeTime(c.lastActivityAt) : "no activity"}</span>
                  {c.trialOrRenewalDate && (
                    <span
                      className={
                        c.subscriptionStatus && isTrialEndingSoon(c.subscriptionStatus, c.trialOrRenewalDate, today)
                          ? "font-medium text-amber-600 dark:text-amber-400"
                          : undefined
                      }
                    >
                      {c.subscriptionStatus === "trial" ? "Trial ends" : "Renews"} {formatDate(c.trialOrRenewalDate)}
                    </span>
                  )}
                  {c.subscriptionStatus && (
                    <Badge variant="outline" className={subscriptionStatusConfig[c.subscriptionStatus].badge}>
                      {subscriptionStatusConfig[c.subscriptionStatus].label}
                    </Badge>
                  )}
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <PaginationBar total={result.total} page={result.page} pageSize={result.pageSize} />
    </>
  )
}
