"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import { SearchInput } from "@/components/domain/search-input"

function CustomerSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("search") ?? "")

  useEffect(() => {
    const current = searchParams.get("search") ?? ""
    if (search === current) return
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (search) params.set("search", search)
      else params.delete("search")
      router.push(`${pathname}?${params.toString()}`)
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <SearchInput value={search} onChange={setSearch} placeholder="Search name or phone…" className="max-w-xs" />
  )
}

export { CustomerSearch }
