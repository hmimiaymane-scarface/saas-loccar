import { toneClasses } from "@/lib/tone"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import type { BusinessPulseSummary, PulseEntry } from "@/lib/business-pulse"

const ROWS: { key: keyof BusinessPulseSummary; label: string }[] = [
  { key: "fleet", label: "Fleet Status" },
  { key: "customers", label: "Customers" },
  { key: "reservations", label: "Reservations" },
  { key: "revenue", label: "Revenue" },
  { key: "maintenance", label: "Maintenance" },
  { key: "cashFlow", label: "Cash Flow" },
  { key: "documents", label: "Documents" },
  { key: "team", label: "Team" },
]

function PulseCell({ label, entry }: { label: string; entry: PulseEntry }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-muted/50 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold", toneClasses[entry.tone].text)}>{entry.label}</span>
    </div>
  )
}

/** Bible Chapter 10 §4 "Business Pulse" — a qualitative label per
 * category, each backed by a real threshold (see
 * `lib/business-pulse.ts`). Deliberately a plain grid, not
 * customizable widgets (requirement 8's own explicit instruction:
 * "the platform decides what deserves attention, not the user
 * arranging tiles"). */
function BusinessPulseGrid({ pulse }: { pulse: BusinessPulseSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>At a glance</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ROWS.map((row) => (
          <PulseCell key={row.key} label={row.label} entry={pulse[row.key]} />
        ))}
      </CardContent>
    </Card>
  )
}

export { BusinessPulseGrid }
