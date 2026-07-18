"use client"

import { useState } from "react"

import type { RentalCompany, Employee, NotificationItem } from "@/types/rental"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

function AppShell({
  company,
  employee,
  notifications,
  unreadCount,
  children,
}: {
  company: RentalCompany
  employee: Employee
  notifications: NotificationItem[]
  unreadCount: number
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex min-h-svh w-full bg-muted/40">
      <Sidebar
        company={company}
        role={employee.role}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header company={company} employee={employee} role={employee.role} notifications={notifications} unreadCount={unreadCount} />
        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export { AppShell }
