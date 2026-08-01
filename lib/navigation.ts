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
  Upload,
  LifeBuoy,
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
 * alongside Documents/Maintenance/Contracts/Activity/Advanced settings.
 *
 * Productization wave 1 phase 10 — also the mobile shell's "More" tab
 * destination (same page, no separate mobile-only route). Reservations
 * and Customers were added here specifically for that: desktop already
 * has both as direct sidebar items (`primaryNav`), so listing them here
 * too is a small, accepted overlap on desktop rather than a new
 * viewport-conditional mechanism — mobile is what actually needs them
 * reachable from `/more`, since they dropped out of its primary 4 tabs. */
export const moreLinks: NavItem[] = [
  {
    title: "Reservations",
    href: "/reservations",
    icon: ClipboardList,
    description: "Booking requests and confirmed reservations",
    roles: ALL_ROLES,
  },
  {
    title: "Customers",
    href: "/customers",
    icon: Users,
    description: "Customer records, licences and documents",
    roles: ALL_ROLES,
  },
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
    title: "Import data",
    href: "/import",
    icon: Upload,
    description: "Bring vehicles and customers in from a spreadsheet",
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
  {
    title: "Help & Support",
    href: "/support",
    icon: LifeBuoy,
    description: "Reach us directly, or send feedback",
    roles: ALL_ROLES,
  },
]

/**
 * Productization wave 1 phase 10 — the mobile bottom tab bar's own
 * primary navigation, deliberately a SEPARATE, shorter list from
 * `primaryNav` rather than a filtered/reflowed version of it (bible:
 * "never copy desktop layouts onto mobile devices" — the IA itself is
 * different, not just the chrome). 4 real destinations plus the
 * center "+" (rendered separately by `MobileBottomNav` — it opens
 * `QuickActionsSheet`, an action picker, not a 5th destination tab, so
 * it isn't a `NavItem` here). "Home" points at the mission-feed page
 * (/home), not desktop's business-command-center /overview — see
 * app/(dashboard)/home. "More" reuses desktop's own `/more` hub
 * (phase 4) rather than a separate mobile-only page — Reservations and
 * Customers (phase-16's original tabs, dropped from the primary 4 per
 * this phase's brief) now live in `moreLinks` alongside everything
 * else that isn't one of the 4.
 *
 * Every item is `ALL_ROLES` — "remove role-driven mobile shells" is
 * this phase's own explicit instruction: the shell no longer varies by
 * role at all (previously Reservations/Fleet/Customers were
 * `OWNER_AND_STAFF`-only). Matches phase 2's "no workforce-specific
 * mobile experience" principle for the rest of the product; the two
 * visible roles (Owner/Staff) already see near-identical access
 * everywhere else.
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
    title: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    description: "Availability and reservation calendar",
    roles: ALL_ROLES,
  },
  {
    title: "Fleet",
    href: "/fleet",
    icon: Car,
    description: "Vehicles, status and daily rates",
    roles: ALL_ROLES,
  },
  {
    title: "More",
    href: "/more",
    icon: MoreHorizontal,
    description: "Everything else you need, one tap away",
    roles: ALL_ROLES,
  },
]

export const allNavItems: NavItem[] = [...primaryNav, ...moneyLinks, ...moreLinks, ...mobilePrimaryNav]

export function navForRole(items: NavItem[], role: EmployeeRole): NavItem[] {
  return items.filter((item) => item.roles.includes(role))
}
