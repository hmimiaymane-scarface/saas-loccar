import { Wallet, TrendingDown } from "lucide-react"

import type { ExpenseSummary } from "@/lib/data"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/status"
import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

function ExpenseSummaryCards({ summary }: { summary: ExpenseSummary }) {
  const topCategories = [...summary.byCategory].sort((a, b) => b.totalMad - a.totalMad).slice(0, 5)

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-red-600 dark:text-red-400">
            <Wallet className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Total this period</span>
            <span className="text-lg font-semibold text-foreground">{formatMad(summary.totalMad)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <TrendingDown className="size-4" /> By category
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          {topCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No expenses recorded yet.</p>
          ) : (
            topCategories.map((c) => (
              <div key={c.category} className="flex justify-between">
                <span className="text-muted-foreground">{EXPENSE_CATEGORY_LABELS[c.category] ?? c.category}</span>
                <span className="text-foreground">{formatMad(c.totalMad)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export { ExpenseSummaryCards }
