"use client"

import { useState } from "react"
import { Search, UserRound } from "lucide-react"

import type { Customer } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

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
  const [activeIndex, setActiveIndex] = useState(0)
  const [prevResults, setPrevResults] = useState(results)
  if (results !== prevResults) {
    setPrevResults(results)
    setActiveIndex(0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const active = results[activeIndex]
      if (active) onSelect(active)
    }
  }

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
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name or phone…"
          className="pl-9"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="customer-search-listbox"
          aria-activedescendant={results[activeIndex] ? `customer-search-option-${results[activeIndex].id}` : undefined}
        />
      </div>
      {results.length > 0 && (
        <div id="customer-search-listbox" role="listbox" className="flex flex-col overflow-hidden rounded-2xl border border-border">
          {results.map((c, i) => (
            <button
              type="button"
              key={c.id}
              id={`customer-search-option-${c.id}`}
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => onSelect(c)}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted",
                i === activeIndex && "bg-muted"
              )}
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
