import Link from "next/link"
import { ChevronRight } from "lucide-react"

import type { NavItem } from "@/lib/navigation"

/**
 * Productization wave 1 phase 4 — a server-renderable link list for the
 * `/money` and `/more` hub pages. Deliberately NOT `components/layout/nav-list.tsx`:
 * that one is `"use client"` (it tracks the active route via
 * `usePathname`), and passing `NavItem[]` as a prop into a client
 * component from a server page fails to serialize — `icon` is a
 * component reference, not data. These hub pages don't need active-path
 * highlighting anyway (they're static landing lists, not a persistent
 * nav), so rendering each icon server-side here avoids the boundary
 * entirely rather than working around it.
 */
function NavLinkList({ items }: { items: NavItem[] }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors hover:bg-muted"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              <Icon className="size-[18px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="truncate text-xs text-muted-foreground">{item.description}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
          </Link>
        )
      })}
    </div>
  )
}

export { NavLinkList }
