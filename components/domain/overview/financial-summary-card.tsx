import { TrendingDown, Scale, ShieldCheck } from "lucide-react"

import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

function FinancialSummaryCard({
  expensesThisMonthMad,
  knownOperatingResultMad,
  depositsHeldMad,
}: {
  expensesThisMonthMad: number
  knownOperatingResultMad: number
  depositsHeldMad: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This month, so far</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingDown className="size-3.5" /> Expenses recorded
          </span>
          <span className="text-foreground">{formatMad(expensesThisMonthMad)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Scale className="size-3.5" /> Known operating result
          </span>
          <span className={knownOperatingResultMad >= 0 ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-red-700 dark:text-red-400"}>
            {formatMad(knownOperatingResultMad)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Deposits currently held
          </span>
          <span className="text-foreground">{formatMad(depositsHeldMad)}</span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          Revenue minus recorded expenses this month — not a full accounting result, and deposits are never counted as revenue.
        </p>
      </CardContent>
    </Card>
  )
}

export { FinancialSummaryCard }
