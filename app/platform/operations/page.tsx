import { MonitorX, ServerCrash, Clock3, BellOff, UploadCloud, Gauge, Bot, FileSignature, Search } from "lucide-react"

import { getOperationalSummary, getRecentOperationalEvents, getAiCallSummary } from "@/lib/platform-data"
import { formatRelativeTime } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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

const SOURCE_LABEL: Record<string, string> = {
  frontend: "Frontend",
  api_route: "API route",
  cron_job: "Cron job",
  notification: "Notification",
  upload: "Upload",
  slow_route: "Slow route",
  contract_generation: "Contract generation",
  search: "Search",
}

export default async function PlatformOperationsPage() {
  const [summary, recentEvents, aiCalls] = await Promise.all([
    getOperationalSummary(7),
    getRecentOperationalEvents(50),
    getAiCallSummary(7),
  ])

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium text-foreground">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Is the product healthy — past {summary.windowDays} days, across every company. Not shown to tenants.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={MonitorX} label="Frontend errors" value={String(summary.frontendErrors)} />
        <StatCard icon={ServerCrash} label="API route errors" value={String(summary.apiRouteErrors)} />
        <StatCard icon={Clock3} label="Cron job failures" value={String(summary.cronJobFailures)} />
        <StatCard icon={BellOff} label="Notification failures" value={String(summary.notificationFailures)} />
        <StatCard icon={UploadCloud} label="Upload failures" value={String(summary.uploadFailures)} />
        <StatCard icon={Gauge} label="Slow routes" value={String(summary.slowRoutes)} hint="over 3s" />
        <StatCard
          icon={FileSignature}
          label="Slow contract generations"
          value={String(summary.slowContractGenerations)}
          hint="over 5s"
        />
        <StatCard icon={Search} label="Slow searches" value={String(summary.slowSearches)} hint="over 800ms" />
        <StatCard
          icon={Bot}
          label="AI call failures"
          value={String(aiCalls.failedCalls)}
          hint={`of ${aiCalls.totalCalls} calls`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Newest first, across every company.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {recentEvents.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            recentEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={event.severity === "error" ? "destructive" : "secondary"}>
                      {SOURCE_LABEL[event.source] ?? event.source}
                    </Badge>
                    {event.context && <span className="text-xs text-muted-foreground">{event.context}</span>}
                  </div>
                  <span className="text-sm text-foreground">{event.message}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                  <span>{event.companyName ?? "—"}</span>
                  <span>{formatRelativeTime(event.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
