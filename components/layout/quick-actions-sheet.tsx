"use client"

import { useState } from "react"
import Link from "next/link"
import { CarFront, ScanLine, ClipboardCheck, Undo2, Camera, UserSearch, type LucideIcon } from "lucide-react"

import type { EmployeeRole } from "@/types/rental"
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"

interface QuickAction {
  label: string
  href: string
  icon: LucideIcon
  /** Same convention as NavItem.roles in lib/navigation.ts — a
   * usability filter only, not enforcement (RLS/has_permission() is
   * what actually gates the destination page). Roadmap phase 17: this
   * list was hardcoded and shown to every role regardless of relevance
   * before this field existed — a Cleaner tapping "New Rental" would
   * land on a page has_permission() then blocks them from using. */
  roles: EmployeeRole[]
}

// Productization wave 1 phase 2 — only Owner/Staff exist as reachable
// roles now, so every quick action is available to both alike.
const FRONT_DESK_ROLES: EmployeeRole[] = ["owner", "manager"]

/** Roadmap phase 16 requirement 5 — the 6 named quick actions, each
 * routed to an existing flow (no new destination pages). "Start
 * Inspection"/"Return Vehicle" go to the reservations list rather than
 * a specific reservation, since which one to inspect has to be chosen
 * first — there's no standalone "start any inspection" entry point in
 * this app and inventing one is out of this checkpoint's scope. */
const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Rental", href: "/reservations/new", icon: CarFront, roles: FRONT_DESK_ROLES },
  { label: "Scan Document", href: "/documents", icon: ScanLine, roles: FRONT_DESK_ROLES },
  { label: "Start Inspection", href: "/reservations?status=confirmed", icon: ClipboardCheck, roles: FRONT_DESK_ROLES },
  { label: "Return Vehicle", href: "/reservations?status=active", icon: Undo2, roles: FRONT_DESK_ROLES },
  { label: "Capture Damage", href: "/damages/new", icon: Camera, roles: FRONT_DESK_ROLES },
  { label: "Search Customer", href: "/customers", icon: UserSearch, roles: FRONT_DESK_ROLES },
]

function quickActionsForRole(role: EmployeeRole): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => a.roles.includes(role))
}

function QuickActionsSheet({ role, children }: { role: EmployeeRole; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const actions = quickActionsForRole(role)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>Quick actions</SheetTitle>
          <SheetDescription>Jump straight into the field workflows you use most.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-3 px-6 pb-8">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              onClick={() => setOpen(false)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border p-4 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-foreground">
                <action.icon className="size-5" />
              </span>
              {action.label}
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { QuickActionsSheet, quickActionsForRole }
