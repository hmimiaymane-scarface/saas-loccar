"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { setCustomerStatus } from "@/app/(dashboard)/customers/actions"
import { SensitiveActionConfirmDialog } from "@/components/domain/shared/sensitive-action-confirm-dialog"
import { customerStatusConfig } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { CustomerStatus } from "@/types/rental"

const STATUS_VALUES = Object.keys(customerStatusConfig) as CustomerStatus[]

function CustomerStatusControl({ customerId, status }: { customerId: string; status: CustomerStatus }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pendingValue, setPendingValue] = useState<string | null>(null)

  function apply(value: CustomerStatus, reason?: string) {
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
        {STATUS_VALUES.map((value) => {
          const visual = customerStatusConfig[value]
          const button = (
            <button
              key={value}
              type="button"
              disabled={isPending || value === status}
              onClick={value === "blocked" ? undefined : () => apply(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                value === status ? visual.badge : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {isPending && pendingValue === value && <Loader2 className="size-3 animate-spin" />}
              {visual.label}
            </button>
          )

          if (value !== "blocked") return button

          return (
            <SensitiveActionConfirmDialog
              key={value}
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
