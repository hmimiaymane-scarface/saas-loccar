import type { FinancialReport } from "@/types/rental"
import { formatMad } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasis ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  )
}

function FinancialReportCard({ report }: { report: FinancialReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial overview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Recorded this period</p>
        <Row label="Rental payments" value={formatMad(report.rentalPaymentsMad)} />
        <Row label="Additional charges" value={formatMad(report.additionalChargesMad)} />
        <Row label="Refunds" value={`-${formatMad(report.refundsMad)}`} />
        <Row label="Deposits collected" value={formatMad(report.depositsCollectedMad)} />
        <Row label="Deposits returned" value={formatMad(report.depositsReturnedMad)} />
        <Row label="Expenses" value={formatMad(report.expensesMad)} />
        <Row label="— of which maintenance" value={formatMad(report.maintenanceCostMad)} />
        <Separator className="my-1" />
        <Row label="Known operating result" value={formatMad(report.knownOperatingResultMad)} emphasis />
        <Separator className="my-1" />
        <p className="pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">As of today</p>
        <Row label="Outstanding balance" value={formatMad(report.outstandingBalanceMad)} />
        <Row label="Deposits currently held" value={formatMad(report.depositsHeldMad)} />
        <Row label="Deposits retained" value={formatMad(report.depositsRetainedMad)} />
        <p className="pt-1 text-xs text-muted-foreground">
          Recorded revenue minus recorded expenses — not a full accounting result. Deposits are never counted as revenue.
        </p>
      </CardContent>
    </Card>
  )
}

export { FinancialReportCard }
