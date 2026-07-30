"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { MaintenanceRecordStatus, Vehicle } from "@/types/rental"
import { maintenanceRecordStatusConfig } from "@/lib/status"
import { NativeSelect } from "@/components/ui/native-select"
import { FilterChip } from "@/components/domain/filter-chip"

const STATUS_ORDER: MaintenanceRecordStatus[] = [
  "planned",
  "scheduled",
  "in_progress",
  "waiting_for_parts",
  "completed",
  "cancelled",
]

function MaintenanceFilters({ vehicles }: { vehicles: Vehicle[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeStatus = searchParams.get("status") as MaintenanceRecordStatus | null

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
        <FilterChip active={!activeStatus} onClick={() => updateParams((params) => params.delete("status"))}>
          All
        </FilterChip>
        {STATUS_ORDER.map((status) => {
          const visual = maintenanceRecordStatusConfig[status]
          return (
            <FilterChip
              key={status}
              active={activeStatus === status}
              activeClassName={visual.badge}
              dotClassName={visual.dot}
              onClick={() => updateParams((params) => params.set("status", status))}
            >
              {visual.label}
            </FilterChip>
          )
        })}
      </div>
    </div>
  )
}

export { MaintenanceFilters }
