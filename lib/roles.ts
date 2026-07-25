import type { EmployeeRole } from "@/types/rental"

/** One short sentence per role — shown wherever a role is picked, so the
 * owner never has to understand a large permission matrix to invite
 * someone (see docs/security.md for what each role can actually do at
 * the database level; this is the plain-language summary of that). */
export const ROLE_DESCRIPTIONS: Record<EmployeeRole, string> = {
  owner: "Full control, including billing and removing other owners.",
  manager: "Runs day-to-day operations — reservations, fleet, maintenance and the team.",
  agent: "Handles bookings, pickups and returns.",
  accountant: "Records payments and expenses, and views financial reports.",
  driver: "Sees only their own assigned deliveries — no customer or payment data.",
  cleaner: "Sees only their own assigned cleaning tasks — no customer or payment data.",
  mechanic: "Sees only their own assigned maintenance jobs — no customer or payment data.",
}

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  owner: "Owner",
  manager: "Manager",
  agent: "Agent",
  accountant: "Accountant",
  driver: "Driver",
  cleaner: "Cleaner",
  mechanic: "Mechanic",
}
