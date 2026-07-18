"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import type { PaymentTransactionType } from "@/types/rental"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"

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
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer or reference…"
          className="pl-9"
        />
      </div>
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
