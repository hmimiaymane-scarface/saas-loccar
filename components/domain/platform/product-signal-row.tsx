"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { updateProductSignalStatus } from "@/app/platform/actions"
import { PRODUCT_SIGNAL_TYPES } from "@/lib/platform/product-signals"
import { formatRelativeTime } from "@/lib/format"
import type { ProductSignalItem } from "@/types/platform"
import { NativeSelect } from "@/components/ui/native-select"

const SIGNAL_LABELS = Object.fromEntries(PRODUCT_SIGNAL_TYPES.map((t) => [t.key, t.label]))

/**
 * Roadmap phase 64 — one logged signal, shared between the per-company
 * card (`product-signal-log.tsx`) and the cross-pilot ranked view
 * (`/platform/product-signals`) — `showCompany` is the only real
 * difference between those two contexts.
 */
function ProductSignalRow({ signal, showCompany = false }: { signal: ProductSignalItem; showCompany?: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function changeStatus(status: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateProductSignalStatus(signal.id, status)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{SIGNAL_LABELS[signal.signalType] ?? signal.signalType}</span>
        <span className="text-xs font-medium text-muted-foreground">Priority {signal.priority}</span>
      </div>
      <p className="text-sm text-foreground">{signal.note}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {showCompany ? `${signal.companyName} · ` : ""}
          {formatRelativeTime(signal.createdAt)}
          {signal.loggedByEmail ? ` · ${signal.loggedByEmail}` : ""}
        </span>
        <NativeSelect
          value={signal.status}
          onChange={(e) => changeStatus(e.target.value)}
          disabled={isPending}
          className="ms-auto h-7 w-auto text-xs"
        >
          <option value="open">Open</option>
          <option value="planned">Planned</option>
          <option value="shipped">Shipped</option>
          <option value="declined">Declined</option>
        </NativeSelect>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { ProductSignalRow }
