import Link from "next/link"
import { Building2, CircleCheck, Clock, AlertTriangle, Ban, Car, CalendarClock, FileText, Activity } from "lucide-react"

import { getPlatformOverview, getPlatformCompaniesList } from "@/lib/platform-data"
import { subscriptionStatusConfig } from "@/lib/platform-status"
import { formatRelativeTime } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/domain/status-badge"

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  hint?: string
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold text-foreground">{value}</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  )
}

export default async function PlatformOverviewPage() {
  const [overview, recent] = await Promise.all([
    getPlatformOverview(),
    getPlatformCompaniesList({ sort: "activity" }, 1, 6),
  ])

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">How the SaaS is being used, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Building2} label="Total companies" value={overview.totalCompanies} />
        <StatCard icon={CircleCheck} label="Active subscriptions" value={overview.activeSubscriptions} />
        <StatCard icon={Clock} label="Active trials" value={overview.activeTrials} />
        <StatCard
          icon={AlertTriangle}
          label="Trials ending soon"
          value={overview.trialsEndingSoon}
          hint="within 7 days"
        />
        <StatCard icon={Ban} label="Suspended companies" value={overview.suspendedCompanies} />
        <StatCard
          icon={Activity}
          label="Active recently"
          value={overview.companiesActiveRecently}
          hint="past 7 days"
        />
        <StatCard icon={Car} label="Total vehicles" value={overview.totalVehicles} />
        <StatCard
          icon={CalendarClock}
          label="Reservations"
          value={overview.reservationsCreatedRecently}
          hint="created, past 7 days"
        />
        <StatCard
          icon={FileText}
          label="Documents uploaded"
          value={overview.documentsUploadedThisMonth}
          hint="this month — automated extraction not yet enabled"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently active companies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {recent.items.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No companies yet.</p>
          ) : (
            recent.items.map((c) => (
              <Link
                key={c.companyId}
                href={`/platform/companies/${c.companyId}`}
                className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-muted/50"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.city ?? "—"} · {c.lastActivityAt ? formatRelativeTime(c.lastActivityAt) : "no activity yet"}
                  </span>
                </div>
                {c.subscriptionStatus && <StatusBadge visual={subscriptionStatusConfig[c.subscriptionStatus]} />}
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
