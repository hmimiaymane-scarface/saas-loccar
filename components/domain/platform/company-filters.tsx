"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import { subscriptionStatusConfig } from "@/lib/platform-status"
import { SUBSCRIPTION_STATUSES } from "@/types/platform"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"

function CompanyFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeStatus = searchParams.get("status")

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    mutate(params)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            defaultValue={searchParams.get("search") ?? ""}
            placeholder="Search by company name…"
            className="pl-9"
            onChange={(e) => {
              const value = e.target.value
              updateParams((params) => {
                if (value) params.set("search", value)
                else params.delete("search")
              })
            }}
          />
        </div>
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
        {SUBSCRIPTION_STATUSES.map((status) => {
          const active = activeStatus === status
          const visual = subscriptionStatusConfig[status]
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

export { CompanyFilters }
