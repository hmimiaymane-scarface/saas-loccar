"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CarFront, Undo2, Wallet, Receipt, UserPlus, Car, type LucideIcon } from "lucide-react"

import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { vibrate } from "@/lib/haptics"
import { loadRecentActionOrder, recordQuickActionUsage, orderByRecency } from "@/lib/quick-actions-recency"

interface QuickAction {
  label: string
  href: string
  icon: LucideIcon
}

/**
 * Productization wave 2 phase 13 — replaces the field-workflow-flavored
 * 6 (Scan Document/Start Inspection/Capture Damage/Search Customer)
 * with the brief's own daily-operations 6. Each already routes to a
 * real, standalone destination — no new pages. "Return Vehicle" still
 * can't avoid landing on the filtered reservations list rather than a
 * specific reservation's return flow: there's no ambient "which
 * vehicle" context at the moment the FAB is tapped, and inventing a
 * vehicle-picker step here would be a new, separate feature, not a
 * fix to this one — documented, not silently worked around.
 */
const PRIMARY_ACTION: QuickAction = { label: "New Rental", href: "/reservations/new", icon: CarFront }

const SECONDARY_ACTIONS: QuickAction[] = [
  { label: "Return Vehicle", href: "/reservations?status=active", icon: Undo2 },
  { label: "Record Payment", href: "/payments", icon: Wallet },
  { label: "Add Expense", href: "/expenses/new", icon: Receipt },
  { label: "Add Customer", href: "/customers/new", icon: UserPlus },
  { label: "Add Vehicle", href: "/fleet/new", icon: Car },
]

function QuickActionsSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [recentOrder, setRecentOrder] = useState<string[]>([])

  useEffect(() => {
    // Reading localStorage here (rather than a lazy useState initializer)
    // is deliberate — it's a browser-only API unavailable during SSR, so
    // it must be read after mount to avoid a hydration mismatch. An empty
    // array here renders identically to the server's own render, so
    // there's nothing to reconcile.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentOrder(loadRecentActionOrder())
  }, [])

  const orderedSecondary = orderByRecency(SECONDARY_ACTIONS, recentOrder)

  function handleActionClick(label: string) {
    recordQuickActionUsage(label)
    setOpen(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) vibrate("light")
        setOpen(next)
      }}
    >
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>Quick actions</SheetTitle>
          <SheetDescription>Jump straight into the workflows you use most.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-6 pb-8">
          <Link
            href={PRIMARY_ACTION.href}
            onClick={() => handleActionClick(PRIMARY_ACTION.label)}
            className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground transition-opacity active:opacity-90"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <PRIMARY_ACTION.icon className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-base font-semibold">{PRIMARY_ACTION.label}</span>
              <span className="text-xs text-primary-foreground/80">Start a new booking</span>
            </span>
          </Link>

          <div className="grid grid-cols-3 gap-3">
            {orderedSecondary.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                onClick={() => handleActionClick(action.label)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border p-4 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-muted text-foreground">
                  <action.icon className="size-5" />
                </span>
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { QuickActionsSheet }
