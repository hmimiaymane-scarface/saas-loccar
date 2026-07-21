"use client"

import Link from "next/link"
import { LogOut, Settings, UserRound } from "lucide-react"

import type { Employee } from "@/types/rental"
import { initials } from "@/lib/format"
import { signOut } from "@/app/(auth)/actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const roleLabel: Record<Employee["role"], string> = {
  owner: "Owner",
  manager: "Manager",
  agent: "Agent",
  accountant: "Accountant",
  driver: "Driver",
}

function UserMenu({ employee }: { employee: Employee }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
        <Avatar size="sm">
          <AvatarFallback>{initials(employee.fullName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {employee.fullName}
          </span>
          <span>{roleLabel[employee.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound />
            Profile
          </Link>
        </DropdownMenuItem>
        {(employee.role === "owner" || employee.role === "manager") && (
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            void signOut()
          }}
        >
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { UserMenu }
