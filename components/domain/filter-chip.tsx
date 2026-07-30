"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface FilterChipProps {
  active: boolean
  onClick: () => void
  children: ReactNode
  /** A colored dot shown before the label — used for status-tinted
   * chips; omit for a plain chip like "All". */
  dotClassName?: string
  /** Applied instead of the default foreground/background invert when
   * active — pass a status config's own `badge` color so the active
   * chip matches that status everywhere else it's shown. */
  activeClassName?: string
}

/**
 * Roadmap phase 51 (UI Consistency Audit) — the filter-toggle pill
 * every `*-filters.tsx` component hand-rolled independently. Each
 * file keeps its own selection logic (single-select "All" + one
 * active status vs. reservation-filters' multi-select toggle set) —
 * only the pill's own look is shared here.
 */
function FilterChip({ active, onClick, children, dotClassName, activeClassName }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active ? (activeClassName ?? "bg-foreground text-background") : "bg-muted text-muted-foreground hover:bg-muted/70"
      )}
    >
      {dotClassName && <span className={cn("size-1.5 shrink-0 rounded-full", dotClassName)} />}
      {children}
    </button>
  )
}

export { FilterChip }
