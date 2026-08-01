"use client"

import type * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface SearchInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "className"> {
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * Roadmap phase 56 — the "type to filter" search box 9 separate
 * filter/search components each hand-duplicated (identical markup,
 * only the debounce timing and placeholder text ever differed —
 * those stay with each caller). Logical `start-3`/`ps-9` (not
 * `left-3`/`pl-9`) so the icon stays at the reading-direction start
 * once `dir="rtl"` is ever set, instead of needing all 9 call sites
 * fixed individually later. Extra input props (`onKeyDown`, `role`,
 * `aria-*`) pass through for `CustomerSearchCombobox`'s keyboard-nav
 * wiring — the one caller with real behavioral differences beyond
 * debounce timing, kept working through the shared shell rather than
 * left out of it.
 */
function SearchInput({ value, onChange, className, ...props }: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ps-9"
        {...props}
      />
    </div>
  )
}

export { SearchInput }
