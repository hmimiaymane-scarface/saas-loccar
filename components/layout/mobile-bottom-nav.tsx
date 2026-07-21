"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import type { EmployeeRole } from "@/types/rental"
import { mobilePrimaryNav, navForRole } from "@/lib/navigation"
import { isActivePath } from "@/components/layout/nav-item"
import { QuickActionsSheet } from "@/components/layout/quick-actions-sheet"

/**
 * Roadmap phase 16 requirements 3-5 — the mobile shell's real
 * navigation surface: a fixed bottom tab bar (one-handed reach; the
 * bible's own "primary actions reachable with one thumb"), not the
 * hamburger-drawer reflow the old MobileNav used. Exactly 5 tabs from
 * mobilePrimaryNav, plus one elevated center button that's deliberately
 * NOT a 6th tab — it opens the quick-actions sheet (requirement 5),
 * which is a different kind of thing (an action picker, not a
 * destination) and earns its own visual treatment.
 */
function MobileBottomNav({ role }: { role: EmployeeRole }) {
  const pathname = usePathname()
  const items = navForRole(mobilePrimaryNav, role)
  const leftItems = items.slice(0, Math.ceil(items.length / 2))
  const rightItems = items.slice(Math.ceil(items.length / 2))

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="relative flex h-16 items-stretch">
        {leftItems.map((item) => (
          <BottomNavLink key={item.href} href={item.href} label={item.title} Icon={item.icon} active={isActivePath(pathname, item.href)} />
        ))}

        <div className="flex w-16 shrink-0 items-center justify-center">
          <QuickActionsSheet>
            <button
              type="button"
              aria-label="Quick actions"
              className="flex size-14 -translate-y-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          </QuickActionsSheet>
        </div>

        {rightItems.map((item) => (
          <BottomNavLink key={item.href} href={item.href} label={item.title} Icon={item.icon} active={isActivePath(pathname, item.href)} />
        ))}
      </div>
    </nav>
  )
}

function BottomNavLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className="size-5" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

export { MobileBottomNav }
