import { TrendingUp, Wallet, ShieldCheck, AlertTriangle } from "lucide-react"

import type { PaymentsSummary } from "@/lib/data"
import { formatMad } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof TrendingUp; label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-muted ${tone ?? "text-muted-foreground"}`}>
          <Icon className="size-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-lg font-semibold text-foreground">{value}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function PaymentsSummaryCards({ summary }: { summary: PaymentsSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard icon={TrendingUp} label="Revenue this month" value={formatMad(summary.revenueThisMonthMad)} tone="text-emerald-600 dark:text-emerald-400" />
      <SummaryCard icon={Wallet} label="Outstanding balance" value={formatMad(summary.outstandingBalanceMad)} tone="text-amber-600 dark:text-amber-400" />
      <SummaryCard icon={ShieldCheck} label="Deposits held" value={formatMad(summary.depositsHeldMad)} tone="text-blue-600 dark:text-blue-400" />
      <SummaryCard icon={AlertTriangle} label="Unresolved damage charges" value={formatMad(summary.unresolvedDamageChargesMad)} tone="text-red-600 dark:text-red-400" />
    </div>
  )
}

export { PaymentsSummaryCards }
