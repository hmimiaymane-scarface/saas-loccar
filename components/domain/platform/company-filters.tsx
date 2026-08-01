"use client"

import { useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import { subscriptionStatusConfig } from "@/lib/platform-status"
import { SUBSCRIPTION_STATUSES } from "@/types/platform"
import { NativeSelect } from "@/components/ui/native-select"
import { FilterChip } from "@/components/domain/filter-chip"
import { SearchInput } from "@/components/domain/search-input"

function CompanyFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeStatus = searchParams.get("status")
  const [search, setSearch] = useState(searchParams.get("search") ?? "")

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    mutate(params)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            updateParams((params) => {
              if (value) params.set("search", value)
              else params.delete("search")
            })
          }}
          placeholder="Search by company name…"
          className="sm:w-72"
        />
        <NativeSelect
          className="sm:w-44"
          defaultValue={searchParams.get("sort") ?? "activity"}
          onChange={(e) => updateParams((params) => params.set("sort", e.target.value))}
        >
          <option value="activity">Sort: recent activity</option>
          <option value="created_at">Sort: newest</option>
        </NativeSelect>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={!activeStatus} onClick={() => updateParams((params) => params.delete("status"))}>
          All
        </FilterChip>
        {SUBSCRIPTION_STATUSES.map((status) => {
          const visual = subscriptionStatusConfig[status]
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

export { CompanyFilters }
