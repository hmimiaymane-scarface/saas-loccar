import {
  LayoutDashboard,
  CalendarDays,
  CarFront,
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
  History,
  Settings,
  MoreHorizontal,
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

const ALL_ROLES: EmployeeRole[] = ["owner", "manager", "agent", "accountant", "driver", "cleaner", "mechanic"]

// Productization wave 1 phase 2 — the visible product only has two
// roles (Owner, Staff/"manager"); every nav item that used to carry a
// narrower workforce-role subset (agent/accountant/driver/mechanic)
// collapses to this pair instead. ALL_ROLES stays as the full 7-value
// list (unchanged) for the couple of items every role has always
// shared — kept as-is rather than narrowed, since it costs nothing and
// still renders correctly for any legacy row that isn't owner/manager.
const OWNER_AND_STAFF: EmployeeRole[] = ["owner", "manager"]

/**
 * Productization wave 1 phase 4 — the sidebar rebuilt around what an
 * owner actually *does* (Home/Calendar/New Rental/Fleet/Customers/
 * Money/More), not one entry per database table. This replaces both
 * the old 13-item primaryNav and secondaryNav entirely — see
 * docs/navigation.md for the full old→new mapping and the reasoning
 * for where each dropped item now lives (mostly `moneyLinks`/
 * `moreLinks` below).
 */
export const primaryNav: NavItem[] = [
  {
    title: "Home",
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
    roles: OWNER_AND_STAFF,
  },
  {
    title: "New Rental",
    href: "/reservations/new",
    icon: CarFront,
    description: "Start a new booking for a customer",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Fleet",
    href: "/fleet",
    icon: Car,
    description: "Vehicles, status and daily rates",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Customers",
    href: "/customers",
    icon: Users,
    description: "Customer records, licences and documents",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Money",
    href: "/money",
    icon: Wallet,
    description: "Payments and running costs",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "More",
    href: "/more",
    icon: MoreHorizontal,
    description: "Documents, maintenance, reports and settings",
    roles: OWNER_AND_STAFF,
  },
]

/** Productization wave 1 phase 4 — `/money`'s own link list (rendered
 * via the same `NavList` the sidebar uses). Payments and Expenses each
 * keep their existing full page — this is a navigation grouping, not a
 * feature merge. */
export const moneyLinks: NavItem[] = [
  {
    title: "Payments",
    href: "/payments",
    icon: Wallet,
    description: "Paid, partial and unpaid balances",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Expenses",
    href: "/expenses",
    icon: Receipt,
    description: "Fuel, maintenance and other running costs",
    roles: OWNER_AND_STAFF,
  },
]

/** Productization wave 1 phase 4 — `/more`'s own link list. Everything
 * that isn't one of the 7 daily-action primary items lands here, one
 * level deeper: Reports nests here rather than under Money since its
 * own page covers business performance broadly (fleet/ops included),
 * not just financial figures, matching the brief's own grouping of it
 * alongside Documents/Maintenance/Contracts/Activity/Advanced settings. */
export const moreLinks: NavItem[] = [
  {
    title: "Documents",
    href: "/documents",
    icon: FileText,
    description: "Contracts and files, uploaded by your team",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Maintenance",
    href: "/maintenance",
    icon: Wrench,
    description: "Maintenance history and alerts",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Reports",
    href: "/reports",
    icon: BarChart3,
    description: "Business performance over time",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Contracts",
    href: "/contracts",
    icon: ScrollText,
    description: "Generated rental agreements — search, sign, amend, archive",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Contract Templates",
    href: "/contract-templates",
    icon: FileSignature,
    description: "Reusable rental agreement templates and variable mappings",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Team",
    href: "/employees",
    icon: UserCog,
    description: "Invite a collaborator to help run the business",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Website",
    href: "/website",
    icon: Globe,
    description: "Your branded public rental website",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "AI Assistant",
    href: "/ai-assistant",
    icon: Sparkles,
    description: "Optional AI help for your daily work",
    roles: ALL_ROLES,
  },
  {
    title: "Activity history",
    href: "/activity",
    icon: History,
    description: "A full log of what's happened in your business",
    roles: ALL_ROLES,
  },
  {
    title: "Advanced settings",
    href: "/settings",
    icon: Settings,
    description: "Company, billing and preferences",
    roles: OWNER_AND_STAFF,
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
 * Unchanged by productization wave 1 phase 4 — already task-shaped and
 * 5-slot-constrained; the new `moreLinks` destinations stay reachable
 * from the mobile shell via UserMenu's "More" entry instead of
 * competing for one of these 5 tabs.
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
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Fleet",
    href: "/fleet",
    icon: Car,
    description: "Vehicles, status and daily rates",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Customers",
    href: "/customers",
    icon: Users,
    description: "Customer records, licences and documents",
    roles: OWNER_AND_STAFF,
  },
  {
    title: "Inbox",
    href: "/ai-assistant",
    icon: Sparkles,
    description: "AI assistant and proactive nudges",
    roles: ALL_ROLES,
  },
]

export const allNavItems: NavItem[] = [...primaryNav, ...moneyLinks, ...moreLinks, ...mobilePrimaryNav]

export function navForRole(items: NavItem[], role: EmployeeRole): NavItem[] {
  return items.filter((item) => item.roles.includes(role))
}
