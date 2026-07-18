"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { DamageStatus, Vehicle } from "@/types/rental"
import { damageStatusConfig } from "@/lib/status"
import { cn } from "@/lib/utils"
import { NativeSelect } from "@/components/ui/native-select"

const STATUS_ORDER: DamageStatus[] = [
  "newly_discovered",
  "existing",
  "under_review",
  "customer_responsible",
  "agency_responsible",
  "repair_planned",
  "repaired",
  "closed",
]

function DamageFilters({ vehicles }: { vehicles: Vehicle[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeStatus = searchParams.get("status") as DamageStatus | null

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      {vehicles.length > 1 && (
        <NativeSelect
          className="sm:w-64"
          defaultValue={searchParams.get("vehicle") ?? ""}
          onChange={(e) =>
            updateParams((params) => {
              if (e.target.value) params.set("vehicle", e.target.value)
              else params.delete("vehicle")
            })
          }
        >
          <option value="">All vehicles</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.make} {v.model} · {v.plate}
            </option>
          ))}
        </NativeSelect>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => updateParams((params) => params.delete("status"))}
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            !activeStatus ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"
          )}
        >
          All
        </button>
        {STATUS_ORDER.map((status) => {
          const active = activeStatus === status
          const visual = damageStatusConfig[status]
          return (
            <button
              key={status}
              type="button"
              onClick={() => updateParams((params) => params.set("status", status))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                active ? visual.badge : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              <span className={cn("size-1.5 rounded-full", visual.dot)} />
              {visual.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { DamageFilters }
