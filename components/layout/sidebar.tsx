"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { cn } from "@/lib/utils"
import type { RentalCompany, EmployeeRole } from "@/types/rental"
import { primaryNav, navForRole } from "@/lib/navigation"
import { CompanyIdentity } from "@/components/layout/company-identity"
import { NavList } from "@/components/layout/nav-list"

interface SidebarProps {
  company: RentalCompany
  role: EmployeeRole
  collapsed: boolean
  onToggleCollapse: () => void
}

function Sidebar({ company, role, collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col gap-6 border-e border-border bg-background py-5 transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px] px-3" : "w-64 px-4"
      )}
    >
      <CompanyIdentity company={company} collapsed={collapsed} />

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
        <NavList items={navForRole(primaryNav, role)} collapsed={collapsed} />
      </div>

      <button
        type="button"
        onClick={onToggleCollapse}
        className={cn(
          "flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          collapsed && "justify-center px-0"
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="size-[18px] shrink-0" />
        ) : (
          <>
            <PanelLeftClose className="size-[18px] shrink-0" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </aside>
  )
}

export { Sidebar }
