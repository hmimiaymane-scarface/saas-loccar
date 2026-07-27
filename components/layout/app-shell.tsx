"use client"

import type { RentalCompany, Employee, NotificationItem } from "@/types/rental"
import { DesktopShell } from "@/components/layout/desktop-shell"
import { MobileShell } from "@/components/layout/mobile-shell"
import { CommandPalette, useCommandPalette } from "@/components/domain/search/command-palette"

interface ShellProps {
  company: RentalCompany
  employee: Employee
  notifications: NotificationItem[]
  unreadCount: number
  children: React.ReactNode
}

/**
 * Roadmap phase 16 — real branching this component previously had none
 * of. Both `DesktopShell` and `MobileShell` receive the identical
 * server-fetched props from `app/(dashboard)/layout.tsx`; which one
 * renders is chosen purely by viewport (Tailwind's `lg` breakpoint),
 * never a JS/user-agent check — this is a CSS-driven fork, not a
 * separate route or redirect, so the URL a user is on is unaffected by
 * which shell wraps it. Both are mounted at once (one hidden via CSS)
 * rather than conditionally rendered, matching this codebase's existing
 * convention (the old hamburger-drawer `MobileNav` was always in the
 * DOM too — deleted in productization wave 1 phase 10, confirmed dead:
 * it only ever rendered inside `Header`, which only `DesktopShell`
 * uses, whose own wrapper is CSS-hidden below the `lg` breakpoint) and
 * avoiding a hydration-timing flash of the wrong shell.
 *
 * The command palette's open/close state and its global Cmd/Ctrl+K
 * listener (`useCommandPalette`) are owned here, once, and passed down
 * as a single `onOpenSearch` callback — mounting both shells
 * simultaneously means each previously ran its own instance of that
 * hook, so a Cmd+K press opened two independent dialogs at once
 * (harmless-looking since only one shell is visible per viewport, but
 * a real bug: focus-trap/scroll-lock fighting between them).
 */
function AppShell(props: ShellProps) {
  const { open, setOpen } = useCommandPalette()

  return (
    <>
      <DesktopShell {...props} onOpenSearch={() => setOpen(true)} />
      <MobileShell {...props} onOpenSearch={() => setOpen(true)} />
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  )
}

export { AppShell }
