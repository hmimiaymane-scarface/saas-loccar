import Link from "next/link"

import { getProductSignals } from "@/lib/platform-data"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { ProductSignalRow } from "@/components/domain/platform/product-signal-row"
import { cn } from "@/lib/utils"

const STATUS_TABS: { key: string | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "open", label: "Open" },
  { key: "planned", label: "Planned" },
  { key: "shipped", label: "Shipped" },
  { key: "declined", label: "Declined" },
]

/**
 * Roadmap phase 64 (Pilot Feedback Loop) — the cross-pilot ranked view
 * this phase's brief asks for: "feedback converted into ranked product
 * changes, not a random request list." Sorted by impact x frequency
 * (see the read RPC itself), with a status filter so "what's still
 * open" is one click away from "what we've already shipped because of
 * this." Logging a new signal happens per-company, on
 * /platform/companies/[id] — this page is read + triage only.
 */
export default async function PlatformProductSignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const signals = await getProductSignals(undefined, status)

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium text-foreground">Product signals</h1>
        <p className="text-sm text-muted-foreground">
          Real pilot behavior, ranked by impact x frequency — not a random request list. Across every company.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.key ? `/platform/product-signals?status=${tab.key}` : "/platform/product-signals"}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
              (status ?? null) === tab.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ranked signals</CardTitle>
          <CardDescription>Highest priority (impact x frequency) first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {signals.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No signals logged yet.</p>
          ) : (
            signals.map((s) => (
              <div key={s.id} className="px-6">
                <ProductSignalRow signal={s} showCompany />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
