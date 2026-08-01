"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { Branch, BookingStatus } from "@/types/rental"
import { bookingStatusConfig } from "@/lib/status"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { FilterChip } from "@/components/domain/filter-chip"
import { SearchInput } from "@/components/domain/search-input"

const STATUS_ORDER: BookingStatus[] = [
  "request",
  "pending",
  "confirmed",
  "active",
  "completed",
  "cancelled",
  "no_show",
]

function ReservationFilters({ branches }: { branches: Branch[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("search") ?? "")

  const activeStatuses = new Set(
    (searchParams.get("status")?.split(",").filter(Boolean) ?? []) as BookingStatus[]
  )

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  function toggleStatus(status: BookingStatus) {
    updateParams((params) => {
      const next = new Set(activeStatuses)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      if (next.size === 0) params.delete("status")
      else params.set("status", Array.from(next).join(","))
    })
  }

  useEffect(() => {
    const current = searchParams.get("search") ?? ""
    if (search === current) return
    const timeout = setTimeout(() => updateParams((params) => {
      if (search) params.set("search", search)
      else params.delete("search")
    }), 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search reference, customer, phone…"
          className="flex-1 sm:max-w-xs"
        />
        <Input
          type="date"
          className="sm:w-40"
          defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) =>
            updateParams((params) => {
              if (e.target.value) params.set("from", e.target.value)
              else params.delete("from")
            })
          }
        />
        <Input
          type="date"
          className="sm:w-40"
          defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) =>
            updateParams((params) => {
              if (e.target.value) params.set("to", e.target.value)
              else params.delete("to")
            })
          }
        />
        {branches.length > 1 && (
          <NativeSelect
            className="sm:w-44"
            defaultValue={searchParams.get("branch") ?? ""}
            onChange={(e) =>
              updateParams((params) => {
                if (e.target.value) params.set("branch", e.target.value)
                else params.delete("branch")
              })
            }
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((status) => {
          const visual = bookingStatusConfig[status]
          return (
            <FilterChip
              key={status}
              active={activeStatuses.has(status)}
              activeClassName={visual.badge}
              dotClassName={visual.dot}
              onClick={() => toggleStatus(status)}
            >
              {visual.label}
            </FilterChip>
          )
        })}
      </div>
    </div>
  )
}

export { ReservationFilters }
