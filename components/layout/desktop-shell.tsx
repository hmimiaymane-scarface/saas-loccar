"use client"

import { useState } from "react"

import type { RentalCompany, Employee, NotificationItem } from "@/types/rental"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

/** Extracted from the previous AppShell body verbatim (roadmap phase
 * 16) — today's desktop experience, unchanged, just hidden below the
 * `lg` breakpoint instead of being the only shell that ever existed. */
function DesktopShell({
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
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="hidden min-h-svh w-full bg-muted/40 lg:flex">
      <Sidebar
        company={company}
        role={employee.role}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          employee={employee}
          notifications={notifications}
          unreadCount={unreadCount}
          onOpenSearch={onOpenSearch}
        />
        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}

export { DesktopShell }
