import type { ReservationPerformanceReport } from "@/types/rental"
import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const SOURCE_LABELS: Record<string, string> = {
  walk_in: "Walk-in",
  phone: "Phone",
  whatsapp: "WhatsApp",
  website: "Website",
  partner: "Partner",
  other: "Other",
}

function ReservationPerformanceCard({ report }: { report: ReservationPerformanceReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reservation performance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Created</span>
            <span className="text-lg font-semibold text-foreground">{report.created}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Confirmed</span>
            <span className="text-lg font-semibold text-foreground">{report.confirmed}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Completed</span>
            <span className="text-lg font-semibold text-foreground">{report.completed}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Cancelled</span>
            <span className="text-lg font-semibold text-foreground">{report.cancelled}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">No-shows</span>
            <span className="text-lg font-semibold text-foreground">{report.noShows}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Converted</span>
            <span className="text-lg font-semibold text-foreground">{report.requestsConvertedRate}%</span>
          </div>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Average duration</span>
            <span className="text-foreground">{report.averageDurationDays} days</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Average value</span>
            <span className="text-foreground">{formatMad(report.averageValueMad)}</span>
          </div>
        </div>

        {report.bySource.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">By source</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {report.bySource
                .filter((s) => s.count > 0)
                .sort((a, b) => b.count - a.count)
                .map((s) => (
                  <span key={s.source} className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                    {SOURCE_LABELS[s.source] ?? s.source} · {s.count}
                  </span>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { ReservationPerformanceCard }
