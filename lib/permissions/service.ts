/**
 * Productization wave 1 phase 3 — the product-facing simplification
 * layer over the phase-17 permission engine. Nothing in
 * `lib/permissions/catalog.ts`/`resolve.ts` changes; this module just
 * groups the 16 raw keys into the 3 switches an owner actually sees
 * ("Can see financial information" / "Can edit or delete important
 * records" / "Can manage settings, team and integrations"), so a small
 * rental company's owner never has to understand RBAC to restrict a
 * Staff member's access. The full catalog stays available at the
 * engine level for a possible future "Advanced" panel — out of scope
 * here.
 *
 * Only the `manager` role (labelled "Staff" in the product — see
 * lib/roles.ts) ever sees these switches; owners always have full
 * access by product definition. `MANAGER_DEFAULT_ALLOWED` mirrors the
 * `manager` row of `role_permission_defaults` exactly (seeded in
 * supabase/migrations/20260804090000_phase17_roles_and_permission_tables.sql,
 * lines 164-221) — every key true except `view_assigned_deliveries`
 * (driver-only, irrelevant to any switch here).
 */

import { createClient } from "@/lib/supabase/server"
import { hasPermission, type PermissionOverrideInput } from "@/lib/permissions/resolve"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface StaffAccessSwitch {
  id: string
  label: string
  keys: string[]
}

export const STAFF_ACCESS_SWITCHES: StaffAccessSwitch[] = [
  {
    id: "financial",
    label: "Can see financial information",
    keys: ["view_financial_reports"],
  },
  {
    id: "edit_records",
    label: "Can edit or delete important records",
    keys: [
      "edit_customers",
      "edit_reservations",
      "manage_vehicles",
      "generate_contracts",
      "approve_contracts",
      "manage_maintenance",
      "manage_cleaning_tasks",
      "record_payments",
      "approve_refunds",
      "download_documents",
    ],
  },
  {
    id: "admin",
    label: "Can manage settings, team and integrations",
    keys: ["manage_employees", "configure_integrations"],
  },
]

const SWITCH_BY_ID = new Map(STAFF_ACCESS_SWITCHES.map((s) => [s.id, s]))

export const MANAGER_DEFAULT_ALLOWED: ReadonlySet<string> = new Set([
  "view_customers",
  "edit_customers",
  "view_reservations",
  "edit_reservations",
  "view_financial_reports",
  "record_payments",
  "manage_vehicles",
  "manage_maintenance",
  "manage_cleaning_tasks",
  "approve_refunds",
  "generate_contracts",
  "approve_contracts",
  "download_documents",
  "manage_employees",
  "configure_integrations",
  // view_assigned_deliveries deliberately omitted — false for manager.
])

/**
 * ON only if every one of the switch's keys currently resolves true
 * for this employee — a partially-overridden bucket reads as the more
 * conservative OFF rather than silently claiming full access.
 */
export function isSwitchOn(switchId: string, overrides: readonly PermissionOverrideInput[], now: Date = new Date()): boolean {
  const swtch = SWITCH_BY_ID.get(switchId)
  if (!swtch) return false
  return swtch.keys.every((key) => hasPermission(key, MANAGER_DEFAULT_ALLOWED, overrides, now))
}

export async function setStaffAccessSwitch(
  supabase: SupabaseServerClient,
  companyId: string,
  userId: string,
  switchId: string,
  allowed: boolean
): Promise<void> {
  const swtch = SWITCH_BY_ID.get(switchId)
  if (!swtch) throw new Error(`Unknown access switch: ${switchId}`)

  for (const key of swtch.keys) {
    const { error } = await supabase.rpc("grant_permission_override", {
      p_company_id: companyId,
      p_user_id: userId,
      p_permission_key: key,
      p_allowed: allowed,
      p_reason: `Staff access toggle: ${swtch.label}`,
    })
    if (error) throw new Error(error.message)
  }
}
