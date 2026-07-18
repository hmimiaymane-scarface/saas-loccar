"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { setCustomerStatus } from "@/app/(dashboard)/customers/actions"
import { cn } from "@/lib/utils"

const STATUS_OPTIONS: { value: "active" | "flagged" | "blocked"; label: string; tone: string }[] = [
  { value: "active", label: "Active", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  { value: "flagged", label: "Flagged", tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  { value: "blocked", label: "Blocked", tone: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
]

function CustomerStatusControl({ customerId, status }: { customerId: string; status: "active" | "flagged" | "blocked" }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pendingValue, setPendingValue] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={isPending || o.value === status}
            onClick={() => {
              setError(null)
              setPendingValue(o.value)
              startTransition(async () => {
                const result = await setCustomerStatus(customerId, o.value)
                if (result.error) setError(result.error)
                setPendingValue(null)
              })
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default",
              o.value === status ? o.tone : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {isPending && pendingValue === o.value && <Loader2 className="size-3 animate-spin" />}
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { CustomerStatusControl }
