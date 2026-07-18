"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import type { NavItem as NavItemType } from "@/lib/navigation"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface NavItemProps {
  item: NavItemType
  collapsed?: boolean
  onNavigate?: () => void
}

function isActivePath(pathname: string, href: string) {
  if (href === "/overview") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavItem({ item, collapsed, onNavigate }: NavItemProps) {
  const pathname = usePathname()
  const active = isActivePath(pathname, item.href)
  const Icon = item.icon

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav-item relative flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.title}</span>}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.title}</TooltipContent>
    </Tooltip>
  )
}

export { NavItem, isActivePath }
