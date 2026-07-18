"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { ReportPeriod } from "@/lib/reports"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom" },
]

function PeriodSelector({ current }: { current: ReportPeriod }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => updateParams((params) => params.set("period", o.value))}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              current === o.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {current === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(e) => updateParams((params) => params.set("from", e.target.value))}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(e) => updateParams((params) => params.set("to", e.target.value))}
          />
        </div>
      )}
    </div>
  )
}

export { PeriodSelector }
