"use client"

import { useState } from "react"
import Link from "next/link"
import { CarFront, ScanLine, ClipboardCheck, Undo2, Camera, UserSearch, type LucideIcon } from "lucide-react"

import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"

interface QuickAction {
  label: string
  href: string
  icon: LucideIcon
}

/** Roadmap phase 16 requirement 5 — the 6 named quick actions, each
 * routed to an existing flow (no new destination pages). "Start
 * Inspection"/"Return Vehicle" go to the reservations list rather than
 * a specific reservation, since which one to inspect has to be chosen
 * first — there's no standalone "start any inspection" entry point in
 * this app and inventing one is out of this checkpoint's scope. */
const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Rental", href: "/reservations/new", icon: CarFront },
  { label: "Scan Document", href: "/documents", icon: ScanLine },
  { label: "Start Inspection", href: "/reservations?status=confirmed", icon: ClipboardCheck },
  { label: "Return Vehicle", href: "/reservations?status=active", icon: Undo2 },
  { label: "Capture Damage", href: "/damages/new", icon: Camera },
  { label: "Search Customer", href: "/customers", icon: UserSearch },
]

function QuickActionsSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>Quick actions</SheetTitle>
          <SheetDescription>Jump straight into the field workflows you use most.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-3 px-6 pb-8">
          {QUICK_ACTIONS.map((action) => (
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

export { QuickActionsSheet }
