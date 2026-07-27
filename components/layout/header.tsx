"use client"

import { usePathname } from "next/navigation"
import { Search } from "lucide-react"

import type { Employee, NotificationItem } from "@/types/rental"
import { allNavItems } from "@/lib/navigation"
import { isActivePath } from "@/components/layout/nav-item"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { UserMenu } from "@/components/layout/user-menu"
import { NotificationBell } from "@/components/layout/notification-bell"

function useCurrentPageTitle() {
  const pathname = usePathname()
  return (
    allNavItems.find((item) => isActivePath(pathname, item.href))?.title ??
    "Overview"
  )
}

function Header({
  employee,
  notifications,
  unreadCount,
  onOpenSearch,
}: {
  employee: Employee
  notifications: NotificationItem[]
  unreadCount: number
  onOpenSearch: () => void
}) {
  const title = useCurrentPageTitle()

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <h2 className="truncate font-heading text-base font-medium text-foreground lg:text-lg">
        {title}
      </h2>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          className="hidden w-64 justify-start gap-2 text-muted-foreground sm:flex"
          onClick={onOpenSearch}
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </Button>

        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={onOpenSearch}>
          <Search className="size-[18px]" />
        </Button>

        <NotificationBell notifications={notifications} unreadCount={unreadCount} />

        <Separator orientation="vertical" className="h-6" />

        <UserMenu employee={employee} />
      </div>
    </header>
  )
}

export { Header }
