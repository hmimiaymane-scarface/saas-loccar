import { CheckCircle2, XCircle, HelpCircle } from "lucide-react"

import { getLaunchGateResults } from "@/lib/platform-data"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import type { LaunchGateStatus } from "@/lib/platform/launch-gate"

const STATUS_CONFIG: Record<LaunchGateStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  pass: { icon: CheckCircle2, label: "Pass", className: "text-emerald-600 dark:text-emerald-400" },
  fail: { icon: XCircle, label: "Fail", className: "text-red-600 dark:text-red-400" },
  not_measured: { icon: HelpCircle, label: "Not yet measured", className: "text-muted-foreground" },
}

/**
 * Roadmap phase 66 (Launch Performance Gate) — the literal "measurable
 * acceptance criteria" the phase brief asks for: each of the 9 named
 * areas, its hard target, and (for the 7 that are automatically
 * measurable) real current data evaluated against that target. The 2
 * page-load criteria stay honestly "not yet measured" — no generic
 * page-render timing exists in this app (see docs/launch-performance-gate.md)
 * — rather than faking a pass.
 */
export default async function PlatformLaunchGatePage() {
  const results = await getLaunchGateResults(7)

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium text-foreground">Launch performance gate</h1>
        <p className="text-sm text-muted-foreground">
          Hard targets for the 9 areas named in the launch performance brief — trailing 7 days, across every company.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Criteria</CardTitle>
          <CardDescription>See docs/launch-performance-gate.md for the full rationale behind each number.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {results.map((r) => {
            const status = STATUS_CONFIG[r.status]
            const Icon = status.icon
            return (
              <div key={r.key} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">{r.area}</span>
                  <span className="text-xs text-muted-foreground">{r.target}</span>
                  {r.currentValueLabel && <span className="text-xs text-muted-foreground">Measured: {r.currentValueLabel}</span>}
                  {r.measurement === "manual" && r.manualMethod && (
                    <span className="text-xs text-muted-foreground">Manual check: {r.manualMethod}</span>
                  )}
                </div>
                <div className={`flex shrink-0 items-center gap-1.5 text-sm font-medium ${status.className}`}>
                  <Icon className="size-4" />
                  {status.label}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </>
  )
}
