"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import type { DocumentCategory } from "@/types/rental"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: "rental_contract", label: "Rental contract" },
  { value: "identity_document", label: "Identity document" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "insurance_document", label: "Insurance document" },
  { value: "vehicle_registration", label: "Vehicle registration" },
  { value: "technical_inspection", label: "Technical inspection" },
  { value: "payment_receipt", label: "Payment receipt" },
  { value: "other", label: "Other" },
]

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
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search filename…"
          className="pl-9"
        />
      </div>
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

export { DocumentFilters, CATEGORY_OPTIONS }
