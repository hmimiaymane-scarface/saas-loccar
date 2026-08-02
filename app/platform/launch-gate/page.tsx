import { CheckCircle2, XCircle, HelpCircle } from "lucide-react"

import { getLaunchGateResults } from "@/lib/platform-data"
import { LAUNCH_RELIABILITY_CHECKS } from "@/lib/platform/launch-reliability"
import { PAID_CUSTOMER_READINESS_CHECKS } from "@/lib/platform/paid-customer-readiness"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import type { LaunchGateStatus } from "@/lib/platform/launch-gate"
import type { ReliabilityStatus } from "@/lib/platform/launch-reliability"

const PERFORMANCE_STATUS_CONFIG: Record<LaunchGateStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  pass: { icon: CheckCircle2, label: "Pass", className: "text-emerald-600 dark:text-emerald-400" },
  fail: { icon: XCircle, label: "Fail", className: "text-red-600 dark:text-red-400" },
  not_measured: { icon: HelpCircle, label: "Not yet measured", className: "text-muted-foreground" },
}

const RELIABILITY_STATUS_CONFIG: Record<ReliabilityStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  pass: { icon: CheckCircle2, label: "Pass", className: "text-emerald-600 dark:text-emerald-400" },
  fail: { icon: XCircle, label: "Fail", className: "text-red-600 dark:text-red-400" },
  not_verified: { icon: HelpCircle, label: "Not yet verified", className: "text-muted-foreground" },
}

/**
 * Roadmap phases 66-67 (Launch Performance Gate, Launch Reliability
 * Gate) — the literal "measurable acceptance criteria" / "confidence
 * from evidence" both phase briefs ask for, on one page since they're
 * two halves of the same "are we actually ready to launch" question.
 *
 * **Performance** (phase 66): 9 numeric targets, 7 evaluated live
 * against real `usage_events`/`operational_events` data — see
 * docs/launch-performance-gate.md.
 *
 * **Reliability** (phase 67): 9 discrete point-in-time facts (did the
 * build pass, did a real device pass) — deliberately NOT computed live
 * the way Performance is; `lib/platform/launch-reliability.ts` is a
 * plain, hand-updated list, since fabricating a live "status" for "did
 * someone test this on a real iPhone" would be exactly the fake
 * evidence this phase exists to prevent. See
 * docs/launch-reliability-gate.md.
 *
 * **Paid-Customer Readiness** (phase 70): the same "reach the point
 * where charging is responsible" question, one level up from pure
 * engineering — 10 named requirements, several citing the exact same
 * evidence as Reliability above rather than re-deriving it. See
 * docs/paid-customer-readiness.md.
 */
export default async function PlatformLaunchGatePage() {
  const results = await getLaunchGateResults(7)

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium text-foreground">Launch gate</h1>
        <p className="text-sm text-muted-foreground">Performance targets, reliability evidence, and paid-customer readiness — is this actually ready to launch?</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
          <CardDescription>
            Hard targets for 9 named areas — trailing 7 days, across every company. See docs/launch-performance-gate.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {results.map((r) => {
            const status = PERFORMANCE_STATUS_CONFIG[r.status]
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

      <Card>
        <CardHeader>
          <CardTitle>Reliability</CardTitle>
          <CardDescription>
            9 point-in-time facts, each with real evidence — never a fabricated live status. See docs/launch-reliability-gate.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {LAUNCH_RELIABILITY_CHECKS.map((c) => {
            const status = RELIABILITY_STATUS_CONFIG[c.status]
            const Icon = status.icon
            return (
              <div key={c.key} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">{c.requirement}</span>
                  <span className="text-xs text-muted-foreground">{c.evidence}</span>
                  {c.lastVerified && <span className="text-xs text-muted-foreground">Last verified: {c.lastVerified}</span>}
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

      <Card>
        <CardHeader>
          <CardTitle>Paid-Customer Readiness</CardTitle>
          <CardDescription>
            10 named requirements for "charging is responsible" — see docs/paid-customer-readiness.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {PAID_CUSTOMER_READINESS_CHECKS.map((c) => {
            const status = RELIABILITY_STATUS_CONFIG[c.status]
            const Icon = status.icon
            return (
              <div key={c.key} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">{c.requirement}</span>
                  <span className="text-xs text-muted-foreground">{c.evidence}</span>
                  {c.lastVerified && <span className="text-xs text-muted-foreground">Last verified: {c.lastVerified}</span>}
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
