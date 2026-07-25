"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { setCustomerStatus } from "@/app/(dashboard)/customers/actions"
import { SensitiveActionConfirmDialog } from "@/components/domain/shared/sensitive-action-confirm-dialog"
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

  function apply(value: "active" | "flagged" | "blocked", reason?: string) {
    setError(null)
    setPendingValue(value)
    startTransition(async () => {
      const result = await setCustomerStatus(customerId, value, reason)
      if (result.error) setError(result.error)
      setPendingValue(null)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((o) => {
          const button = (
            <button
              key={o.value}
              type="button"
              disabled={isPending || o.value === status}
              onClick={o.value === "blocked" ? undefined : () => apply(o.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                o.value === status ? o.tone : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {isPending && pendingValue === o.value && <Loader2 className="size-3 animate-spin" />}
              {o.label}
            </button>
          )

          if (o.value !== "blocked") return button

          return (
            <SensitiveActionConfirmDialog
              key={o.value}
              trigger={button}
              title="Block this customer?"
              description="They'll be flagged as blocked wherever this record is shown. A reason is required and recorded on their history."
              confirmLabel="Block customer"
              reasonPlaceholder="Reason for blocking…"
              onConfirm={(reason) => setCustomerStatus(customerId, "blocked", reason)}
            />
          )
        })}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { CustomerStatusControl }
