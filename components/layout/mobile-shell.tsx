"use client"

import { Search } from "lucide-react"

import type { RentalCompany, Employee, NotificationItem } from "@/types/rental"
import { CompanyIdentity } from "@/components/layout/company-identity"
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"
import { NotificationBell } from "@/components/layout/notification-bell"
import { OfflineQueueIndicator } from "@/components/layout/offline-queue-indicator"
import { UserMenu } from "@/components/layout/user-menu"
import { InstallPrompt } from "@/components/pwa/install-prompt"
import { useIdleRedirect } from "@/hooks/use-idle-redirect"
import { Button } from "@/components/ui/button"

/**
 * Roadmap phase 16 — a genuinely distinct mobile product, not
 * `Sidebar`/`Header` reflowed (bible: "never copy desktop layouts onto
 * mobile devices"). Compact top bar (company identity instead of a
 * per-page title lookup — each mobile page owns its own heading in its
 * content, same as every page already does via SectionHeader) plus a
 * fixed bottom tab bar for primary navigation, rather than the old
 * hamburger-drawer MobileNav. Receives the exact same server-fetched
 * props DesktopShell does (see AppShell) — same data, different
 * product, enforced structurally.
 */
function MobileShell({
  company,
  employee,
  notifications,
  unreadCount,
  onOpenSearch,
  children,
}: {
  company: RentalCompany
  employee: Employee
  notifications: NotificationItem[]
  unreadCount: number
  onOpenSearch: () => void
  children: React.ReactNode
}) {
  useIdleRedirect()

  return (
    <div className="flex min-h-svh w-full flex-col bg-muted/40 lg:hidden">
      <header
        className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <CompanyIdentity company={company} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Search" onClick={onOpenSearch}>
            <Search className="size-[18px]" />
          </Button>
          <OfflineQueueIndicator companyId={company.id} />
          <NotificationBell notifications={notifications} unreadCount={unreadCount} />
          <UserMenu employee={employee} />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4 pb-24">
        <InstallPrompt />
        {children}
      </main>

      <MobileBottomNav role={employee.role} />
    </div>
  )
}

export { MobileShell }
