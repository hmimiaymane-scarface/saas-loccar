"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dialog as DialogPrimitive } from "radix-ui"
import { Search, Car, User, ClipboardList, FileSignature, FileText, UserCog, Loader2 } from "lucide-react"

import { globalSearchAction } from "@/app/(dashboard)/search/actions"
import { groupSearchResultsByType, type SearchResult, type SearchResultType } from "@/lib/search"
import { InlineEmpty } from "@/components/domain/empty-placeholder"
import { cn } from "@/lib/utils"

const TYPE_ICON: Record<SearchResultType, typeof Car> = {
  vehicle: Car,
  customer: User,
  reservation: ClipboardList,
  contract: FileSignature,
  document: FileText,
  employee: UserCog,
}

/** Productization wave 2 phase 14 — section headers for real grouped
 * results (`groupSearchResultsByType`), replacing the old inline
 * per-row type badge. */
const TYPE_LABEL_PLURAL: Record<SearchResultType, string> = {
  vehicle: "Vehicles",
  customer: "Customers",
  reservation: "Reservations",
  contract: "Contracts",
  document: "Documents",
  employee: "Team",
}

/**
 * Roadmap phase 13 requirement 7 — a real, working "search as a
 * universal command," not the decorative button that existed before
 * this phase. Deliberately a plain custom dialog over radix-ui's
 * `Dialog` primitive (already a dependency via `alert-dialog.tsx`)
 * rather than adding the `cmdk` package — this doesn't need virtual
 * scrolling, nested command groups, or any of the other things a
 * dedicated command-menu library solves; a debounced query and a
 * grouped list cover every entity type requirement 7 names.
 *
 * Productization wave 2 phase 14 — results now render as real sections
 * (`groupSearchResultsByType`), one labeled group per entity type,
 * replacing the earlier flat list with only a small inline type badge
 * per row.
 */
function optionId(r: SearchResult) {
  return `command-palette-option-${r.type}-${r.id}`
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [pending, startTransition] = useTransition()
  const [activeIndex, setActiveIndex] = useState(0)

  const groups = groupSearchResultsByType(results)
  const flatResults = groups.flatMap((g) => g.results)

  useEffect(() => {
    const active = flatResults[activeIndex]
    if (!active) return
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  useEffect(() => {
    if (query.trim().length < 2) return
    const timeout = setTimeout(() => {
      startTransition(async () => {
        setResults(await globalSearchAction(query))
        setActiveIndex(0)
      })
    }, 200)
    return () => clearTimeout(timeout)
  }, [query])

  function handleQueryChange(value: string) {
    setQuery(value)
    if (value.trim().length < 2) setResults([])
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setQuery("")
      setResults([])
      setActiveIndex(0)
    }
  }

  function go(href: string) {
    handleOpenChange(false)
    router.push(href)
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (flatResults.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const active = flatResults[activeIndex]
      if (active) go(active.href)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className="fixed top-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl bg-background shadow-lg ring-1 ring-foreground/5 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 dark:ring-foreground/10"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search vehicles, customers, reservations, contracts, documents, team…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded={flatResults.length > 0}
              aria-controls="command-palette-listbox"
              aria-activedescendant={flatResults[activeIndex] ? optionId(flatResults[activeIndex]) : undefined}
            />
            {pending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {query.trim().length < 2 ? (
              <InlineEmpty className="px-3 py-6 text-center">Type at least 2 characters to search.</InlineEmpty>
            ) : results.length === 0 && !pending ? (
              <InlineEmpty className="px-3 py-6 text-center">No results for &quot;{query}&quot;.</InlineEmpty>
            ) : (
              <div id="command-palette-listbox" role="listbox" className="flex flex-col gap-3">
                {groups.map((group) => (
                  <div key={group.type} className="flex flex-col">
                    <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{TYPE_LABEL_PLURAL[group.type]}</p>
                    <ul className="flex flex-col">
                      {group.results.map((r: SearchResult) => {
                        const Icon = TYPE_ICON[r.type]
                        const isActive = flatResults[activeIndex]?.id === r.id && flatResults[activeIndex]?.type === r.type
                        return (
                          <li key={`${r.type}-${r.id}`}>
                            <button
                              type="button"
                              id={optionId(r)}
                              role="option"
                              aria-selected={isActive}
                              onClick={() => go(r.href)}
                              onMouseEnter={() => setActiveIndex(flatResults.indexOf(r))}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted",
                                isActive && "bg-muted"
                              )}
                            >
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <Icon className="size-4" />
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-medium text-foreground">{r.title}</span>
                                <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Owns the open/close state and the Cmd/Ctrl+K shortcut — the header
 * just renders this once and toggles it from its own search buttons
 * via the returned `open` setter, same "one owner, passed down"
 * pattern used elsewhere in this app for dialogs. */
function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return { open, setOpen }
}

export { CommandPalette, useCommandPalette }
