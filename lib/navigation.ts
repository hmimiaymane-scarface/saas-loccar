import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Car,
  Users,
  Wallet,
  Receipt,
  Wrench,
  FileText,
  FileSignature,
  ScrollText,
  UserCog,
  BarChart3,
  Globe,
  Sparkles,
  Bell,
  Settings,
  Home,
  type LucideIcon,
} from "lucide-react"

import type { EmployeeRole } from "@/types/rental"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  description: string
  /** Roles that see this item in the sidebar/mobile nav. This is a
   * usability filter only — RLS (see docs/security.md) is what actually
   * enforces who can read or write the underlying data. */
  roles: EmployeeRole[]
}

const ALL_ROLES: EmployeeRole[] = ["owner", "manager", "agent", "accountant", "driver"]

export const primaryNav: NavItem[] = [
  {
    title: "Overview",
    href: "/overview",
    icon: LayoutDashboard,
    description: "The state of your business at a glance",
    roles: ALL_ROLES,
  },
  {
    title: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    description: "Availability and reservation calendar",
    roles: ["owner", "manager", "agent", "driver"],
  },
  {
    title: "Reservations",
    href: "/reservations",
    icon: ClipboardList,
    description: "Booking requests and confirmed reservations",
    roles: ["owner", "manager", "agent"],
  },
  {
    title: "Fleet",
    href: "/fleet",
    icon: Car,
    description: "Vehicles, status and daily rates",
    roles: ["owner", "manager", "agent"],
  },
  {
    title: "Customers",
    href: "/customers",
    icon: Users,
    description: "Customer records, licences and documents",
    roles: ["owner", "manager", "agent"],
  },
  {
    title: "Payments",
    href: "/payments",
    icon: Wallet,
    description: "Paid, partial and unpaid balances",
    roles: ["owner", "manager", "accountant"],
  },
  {
    title: "Expenses",
    href: "/expenses",
    icon: Receipt,
    description: "Fuel, maintenance and other running costs",
    roles: ["owner", "manager", "accountant"],
  },
  {
    title: "Maintenance",
    href: "/maintenance",
    icon: Wrench,
    description: "Maintenance history and alerts",
    roles: ["owner", "manager"],
  },
  {
    title: "Documents",
    href: "/documents",
    icon: FileText,
    description: "Contracts and files, uploaded by your team",
    roles: ["owner", "manager", "agent"],
  },
  {
    title: "Contracts",
    href: "/contracts",
    icon: ScrollText,
    description: "Generated rental agreements — search, sign, amend, archive",
    roles: ["owner", "manager", "agent"],
  },
  {
    title: "Contract Templates",
    href: "/contract-templates",
    icon: FileSignature,
    description: "Reusable rental agreement templates and variable mappings",
    roles: ["owner", "manager"],
  },
  {
    title: "Employees",
    href: "/employees",
    icon: UserCog,
    description: "Team members, roles and permissions",
    roles: ["owner", "manager"],
  },
  {
    title: "Reports",
    href: "/reports",
    icon: BarChart3,
    description: "Business performance over time",
    roles: ["owner", "manager", "accountant"],
  },
]

export const secondaryNav: NavItem[] = [
  {
    title: "Website",
    href: "/website",
    icon: Globe,
    description: "Your branded public rental website",
    roles: ["owner", "manager"],
  },
  {
    title: "AI Assistant",
    href: "/ai-assistant",
    icon: Sparkles,
    description: "Optional AI help for your daily work",
    roles: ALL_ROLES,
  },
  {
    title: "Notifications",
    href: "/notifications",
    icon: Bell,
    description: "Updates that need your attention",
    roles: ALL_ROLES,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Company, billing and preferences",
    roles: ["owner", "manager"],
  },
]

/**
 * Roadmap phase 16 — the mobile bottom tab bar's own primary
 * navigation, deliberately a SEPARATE, shorter list from `primaryNav`
 * rather than a filtered/reflowed version of it (bible: "never copy
 * desktop layouts onto mobile devices" — the IA itself is different,
 * not just the chrome). Exactly 5 destinations per requirement 4;
 * "Home" points at the mission-feed page (/home), not desktop's
 * business-command-center /overview — see app/(dashboard)/home.
 * Settings/Website/Contract Templates/etc. deliberately have no mobile
 * equivalent here — reachable from the profile screen instead, never
 * competing for one of the 5 tabs.
 */
export const mobilePrimaryNav: NavItem[] = [
  {
    title: "Home",
    href: "/home",
    icon: Home,
    description: "Today's assigned work",
    roles: ALL_ROLES,
  },
  {
    title: "Reservations",
    href: "/reservations",
    icon: ClipboardList,
    description: "Booking requests and confirmed reservations",
    roles: ["owner", "manager", "agent"],
  },
  {
    title: "Fleet",
    href: "/fleet",
    icon: Car,
    description: "Vehicles, status and daily rates",
    roles: ["owner", "manager", "agent"],
  },
  {
    title: "Customers",
    href: "/customers",
    icon: Users,
    description: "Customer records, licences and documents",
    roles: ["owner", "manager", "agent"],
  },
  {
    title: "Inbox",
    href: "/ai-assistant",
    icon: Sparkles,
    description: "AI assistant and proactive nudges",
    roles: ALL_ROLES,
  },
]

export const allNavItems: NavItem[] = [...primaryNav, ...secondaryNav, ...mobilePrimaryNav]

export function navForRole(items: NavItem[], role: EmployeeRole): NavItem[] {
  return items.filter((item) => item.roles.includes(role))
}
