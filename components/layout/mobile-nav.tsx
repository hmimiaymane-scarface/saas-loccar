"use client"

import { useState } from "react"
import { Menu } from "lucide-react"

import type { RentalCompany, EmployeeRole } from "@/types/rental"
import { primaryNav, navForRole } from "@/lib/navigation"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet"
import { CompanyIdentity } from "@/components/layout/company-identity"
import { NavList } from "@/components/layout/nav-list"

function MobileNav({ company, role }: { company: RentalCompany; role: EmployeeRole }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-[18px]" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 max-w-[85vw]">
        <SheetHeader>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Jump to a section of your rental office
          </SheetDescription>
          <CompanyIdentity company={company} />
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
          <NavList items={navForRole(primaryNav, role)} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { MobileNav }
