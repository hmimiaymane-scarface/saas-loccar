/**
 * Roadmap phase 17 — the fixed catalog of permission keys the granular
 * permission engine can grant or deny. Deliberately a closed,
 * hand-maintained list (same convention as
 * lib/contracts/variables.ts's CONTRACT_VARIABLE_CATALOG) rather than
 * anything derived from the database: every key here is one
 * has_permission() actually resolves and at least one RLS policy or
 * server action actually checks — see docs/permissions.md for the
 * table mapping each key to what it gates. A key that exists here but
 * nothing checks would be a permission that looks grantable in the UI
 * but silently does nothing; a key nothing here recognizes can never be
 * granted, so grant_permission_override() validates p_permission_key
 * against this same list server-side.
 */

export interface PermissionDef {
  key: string
  label: string
  group: "customers" | "reservations" | "financial" | "contracts" | "fleet" | "operations" | "team"
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: "view_customers", label: "View customer records", group: "customers" },
  { key: "edit_customers", label: "Create and edit customer records", group: "customers" },

  { key: "view_reservations", label: "View reservations", group: "reservations" },
  { key: "edit_reservations", label: "Create and edit reservations", group: "reservations" },

  { key: "view_financial_reports", label: "View payments, expenses and financial reports", group: "financial" },
  { key: "record_payments", label: "Record payments and expenses", group: "financial" },
  { key: "approve_refunds", label: "Approve refunds", group: "financial" },

  { key: "generate_contracts", label: "Generate rental contracts", group: "contracts" },
  { key: "approve_contracts", label: "Approve contract amendments", group: "contracts" },
  { key: "download_documents", label: "Download customer and contract documents", group: "contracts" },

  { key: "manage_vehicles", label: "Create and edit fleet vehicles", group: "fleet" },
  { key: "manage_maintenance", label: "Manage maintenance jobs", group: "fleet" },
  { key: "manage_cleaning_tasks", label: "Manage cleaning tasks", group: "fleet" },

  { key: "view_assigned_deliveries", label: "View own assigned deliveries", group: "operations" },

  { key: "manage_employees", label: "Manage team members and roles", group: "team" },
  { key: "configure_integrations", label: "Configure company integrations", group: "team" },
]

const VALID_PERMISSION_KEYS = new Set(PERMISSION_CATALOG.map((p) => p.key))

export function isKnownPermission(key: string): boolean {
  return VALID_PERMISSION_KEYS.has(key)
}
