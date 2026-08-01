"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import { NativeSelect } from "@/components/ui/native-select"
import { SearchInput } from "@/components/domain/search-input"
import { CATEGORY_OPTIONS } from "@/lib/documents"

function DocumentFilters() {
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchInput value={search} onChange={setSearch} placeholder="Search filename…" className="flex-1 sm:max-w-xs" />
      <NativeSelect
        className="sm:w-56"
        defaultValue={searchParams.get("category") ?? ""}
        onChange={(e) =>
          updateParams((params) => {
            if (e.target.value) params.set("category", e.target.value)
            else params.delete("category")
          })
        }
      >
        <option value="">All categories</option>
        {CATEGORY_OPTIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

export { DocumentFilters }
