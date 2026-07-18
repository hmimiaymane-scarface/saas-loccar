import { formatMad } from "@/lib/format"

interface BarDatum {
  label: string
  valueMad: number
}

/** A plain CSS bar list, not a charting library — the brief explicitly
 * asks for "a small number of useful charts," not decorative analytics,
 * so this stays dependency-free and legible at a glance. */
function SimpleBarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.valueMad))

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough data yet.</p>
  }

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-foreground">{d.label}</span>
            <span className="shrink-0 text-muted-foreground">{formatMad(d.valueMad)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, Math.round((d.valueMad / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export { SimpleBarChart }
