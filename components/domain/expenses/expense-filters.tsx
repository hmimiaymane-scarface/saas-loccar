"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import type { Vehicle } from "@/types/rental"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/status"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"

function ExpenseFilters({ vehicles }: { vehicles: Vehicle[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("search") ?? "")

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  useEffect(() => {
    const current = searchParams.get("search") ?? ""
    if (search === current) return
    const timeout = setTimeout(
      () =>
        updateParams((params) => {
          if (search) params.set("search", search)
          else params.delete("search")
        }),
      350
    )
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search supplier or description…"
          className="pl-9"
        />
      </div>
      <NativeSelect
        className="sm:w-52"
        defaultValue={searchParams.get("category") ?? ""}
        onChange={(e) =>
          updateParams((params) => {
            if (e.target.value) params.set("category", e.target.value)
            else params.delete("category")
          })
        }
      >
        <option value="">All categories</option>
        {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
      {vehicles.length > 1 && (
        <NativeSelect
          className="sm:w-56"
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
    </div>
  )
}

export { ExpenseFilters }
