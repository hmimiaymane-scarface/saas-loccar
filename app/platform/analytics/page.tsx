import {
  CarFront,
  Undo2,
  Search,
  Zap,
  BellRing,
  AlertOctagon,
  Upload,
  Download,
} from "lucide-react"

import { getUsageAnalyticsSummary, getDropoffSummary } from "@/lib/platform-data"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
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

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return "—"
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.round(seconds % 60)
  return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`
}

function completionRate(completed: number, started: number): string {
  if (started === 0) return "—"
  return `${Math.round((completed / started) * 100)}%`
}

function FunnelCard({
  title,
  started,
  completed,
  medianSeconds,
  dropoff,
}: {
  title: string
  started: number
  completed: number
  medianSeconds: number | null
  dropoff: { step: number; stepLabel: string | null; sessionsReached: number }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {started} started · {completed} completed · {completionRate(completed, started)} completion rate · median{" "}
          {formatSeconds(medianSeconds)} to finish
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-0">
        {dropoff.map((row) => {
          const pct = started === 0 ? 0 : Math.round((row.sessionsReached / started) * 100)
          return (
            <div key={row.step} className="flex items-center gap-3 px-6 py-2">
              <span className="w-32 shrink-0 text-sm text-foreground">{row.stepLabel ?? `Step ${row.step + 1}`}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                {row.sessionsReached} · {pct}%
              </span>
            </div>
          )
        })}
        {dropoff.length === 0 && <p className="px-6 py-4 text-sm text-muted-foreground">No attempts in this window yet.</p>}
      </CardContent>
    </Card>
  )
}

export default async function PlatformAnalyticsPage() {
  const [summary, newRentalDropoff, returnDropoff] = await Promise.all([
    getUsageAnalyticsSummary(30),
    getDropoffSummary("new_rental", 30),
    getDropoffSummary("return", 30),
  ])

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium text-foreground">Usage analytics</h1>
        <p className="text-sm text-muted-foreground">
          How owners actually use RentalOS, across every company — past {summary.windowDays} days. Not shown to tenants.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
        <FunnelCard
          title="New Rental"
          started={summary.newRentalStarted}
          completed={summary.newRentalCompleted}
          medianSeconds={summary.newRentalMedianSeconds}
          dropoff={newRentalDropoff}
        />
        <FunnelCard
          title="Return"
          started={summary.returnStarted}
          completed={summary.returnCompleted}
          medianSeconds={summary.returnMedianSeconds}
          dropoff={returnDropoff}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Search} label="Search opened" value={String(summary.searchOpened)} hint={`${summary.searchQueryRun} queries run`} />
        <StatCard icon={Zap} label="Quick actions used" value={String(summary.quickActionUsed)} />
        <StatCard icon={BellRing} label="Alert actions used" value={String(summary.alertActionUsed)} />
        <StatCard icon={AlertOctagon} label="Errors" value={String(summary.errorOccurred)} hint="crashes + wizard failures" />
        <StatCard icon={Upload} label="Imports completed" value={String(summary.importCompleted)} />
        <StatCard
          icon={Download}
          label="PWA installs"
          value={String(summary.pwaInstalled)}
          hint={`${summary.pwaInstallAccepted} accepted, ${summary.pwaInstallDismissed} dismissed`}
        />
        <StatCard icon={CarFront} label="New Rental started" value={String(summary.newRentalStarted)} />
        <StatCard icon={Undo2} label="Return started" value={String(summary.returnStarted)} />
      </div>
    </>
  )
}
