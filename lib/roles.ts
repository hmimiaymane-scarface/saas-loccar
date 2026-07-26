import type { EmployeeRole } from "@/types/rental"

/** One short sentence per role — shown wherever a role is picked, so the
 * owner never has to understand a large permission matrix to invite
 * someone (see docs/security.md for what each role can actually do at
 * the database level; this is the plain-language summary of that).
 *
 * Productization wave 1 phase 2: the visible product now only offers
 * Owner and Staff (backed by the existing `manager` role, which already
 * has near-identical permission defaults to owner — see
 * docs/permissions.md). agent/accountant/driver/cleaner/mechanic stay
 * here as complete `Record<EmployeeRole, ...>` entries for type
 * completeness and to render sanely if a legacy row ever has one of
 * them, but nothing in the UI lets a new member be invited or changed
 * to any of them anymore (see invite-form.tsx/member-row.tsx). */
export const ROLE_DESCRIPTIONS: Record<EmployeeRole, string> = {
  owner: "Full control, including billing and removing other owners.",
  manager: "Full day-to-day access to run the business alongside you — reservations, fleet, customers, payments, contracts, maintenance.",
  agent: "Handles bookings, pickups and returns.",
  accountant: "Records payments and expenses, and views financial reports.",
  driver: "Sees only their own assigned deliveries — no customer or payment data.",
  cleaner: "Sees only their own assigned cleaning tasks — no customer or payment data.",
  mechanic: "Sees only their own assigned maintenance jobs — no customer or payment data.",
}

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  owner: "Owner",
  manager: "Staff",
  agent: "Agent",
  accountant: "Accountant",
  driver: "Driver",
  cleaner: "Cleaner",
  mechanic: "Mechanic",
}
