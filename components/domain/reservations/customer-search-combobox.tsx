"use client"

import { Search, UserRound } from "lucide-react"

import type { Customer } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CustomerSearchComboboxProps {
  selectedCustomer: Customer | null
  onSelect: (customer: Customer) => void
  onClear: () => void
  query: string
  onQueryChange: (value: string) => void
  results: Customer[]
}

/**
 * Roadmap phase 51 (UI Consistency Audit) — the "type to filter, click
 * a result" customer picker `reservation-form.tsx` and
 * `new-rental-wizard.tsx` each independently reimplemented (identical
 * markup). Presentational only — each caller keeps its own
 * search-debounce timing (the two files genuinely differ there: one
 * debounces on a timeout, the other searches on every change), so
 * that behavior isn't folded in here.
 */
function CustomerSearchCombobox({ selectedCustomer, onSelect, onClear, query, onQueryChange, results }: CustomerSearchComboboxProps) {
  if (selectedCustomer) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-border px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-muted">
            <UserRound className="size-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-medium text-foreground">{selectedCustomer.fullName}</p>
            <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Change
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Search by name or phone…" className="pl-9" />
      </div>
      {results.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
          {results.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => onSelect(c)}
              className="flex flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"
            >
              <span className="text-sm font-medium text-foreground">{c.fullName}</span>
              <span className="text-xs text-muted-foreground">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { CustomerSearchCombobox }
