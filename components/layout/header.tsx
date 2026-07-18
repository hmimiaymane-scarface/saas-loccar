"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search, Bell } from "lucide-react"

import type { RentalCompany, Employee, EmployeeRole } from "@/types/rental"
import { allNavItems } from "@/lib/navigation"
import { isActivePath } from "@/components/layout/nav-item"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MobileNav } from "@/components/layout/mobile-nav"
import { UserMenu } from "@/components/layout/user-menu"

function useCurrentPageTitle() {
  const pathname = usePathname()
  return (
    allNavItems.find((item) => isActivePath(pathname, item.href))?.title ??
    "Overview"
  )
}

function Header({
  company,
  employee,
  role,
}: {
  company: RentalCompany
  employee: Employee
  role: EmployeeRole
}) {
  const title = useCurrentPageTitle()

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <MobileNav company={company} role={role} />

      <h2 className="truncate font-heading text-base font-medium text-foreground lg:text-lg">
        {title}
      </h2>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          className="hidden w-64 justify-start gap-2 text-muted-foreground sm:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </Button>

        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search">
          <Search className="size-[18px]" />
        </Button>

        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" asChild>
          <Link href="/notifications">
            <Bell className="size-[18px]" />
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-red-500" />
          </Link>
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <UserMenu employee={employee} />
      </div>
    </header>
  )
}

export { Header }
