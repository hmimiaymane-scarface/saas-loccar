"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { PaymentTransactionType } from "@/types/rental"
import { NativeSelect } from "@/components/ui/native-select"
import { SearchInput } from "@/components/domain/search-input"

const TYPE_OPTIONS: { value: PaymentTransactionType; label: string }[] = [
  { value: "rental_payment", label: "Rental payment" },
  { value: "deposit_collection", label: "Deposit collected" },
  { value: "deposit_return", label: "Deposit returned" },
  { value: "refund", label: "Refund" },
  { value: "damage_charge", label: "Damage charge" },
  { value: "additional_charge", label: "Additional charge" },
]

function PaymentFilters() {
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
      <SearchInput value={search} onChange={setSearch} placeholder="Search customer or reference…" className="flex-1 sm:max-w-xs" />
      <NativeSelect
        className="sm:w-56"
        defaultValue={searchParams.get("type") ?? ""}
        onChange={(e) =>
          updateParams((params) => {
            if (e.target.value) params.set("type", e.target.value)
            else params.delete("type")
          })
        }
      >
        <option value="">All transaction types</option>
        {TYPE_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

export { PaymentFilters }
