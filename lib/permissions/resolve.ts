/**
 * Pure mirror of has_permission() (see
 * supabase/migrations/20260804090100_phase17_permission_engine.sql) —
 * same convention as lib/team-rules.ts for the membership-lifecycle
 * RPCs. The database is what actually enforces access; this exists so
 * the UI can decide what to show/enable *before* a doomed request
 * round-trips to Postgres, and so the precedence rule is
 * unit-testable without a live project.
 *
 * Precedence: a non-expired per-employee override wins over the role
 * default; with no override and no matching default row, the result is
 * false (deny by default, same as the SQL function's coalesce chain).
 */

export interface PermissionOverrideInput {
  permissionKey: string
  allowed: boolean
  expiresAt: string | null
  createdAt: string
}

export function isOverrideActive(override: PermissionOverrideInput, now: Date): boolean {
  return override.expiresAt === null || new Date(override.expiresAt) > now
}

/**
 * @param roleDefaults Permission keys the caller's role is granted by
 * default (already filtered to the current company/role — this mirrors
 * a `role_permission_defaults` lookup for one role, not the whole table).
 * @param overrides Every employee_permission_overrides row for the
 * current user, regardless of expiry or order — filtering and
 * newest-first tie-breaking both happen here so the caller doesn't have
 * to reason about "now" or ordering.
 */
export function hasPermission(
  permissionKey: string,
  roleDefaults: ReadonlySet<string> | readonly string[],
  overrides: readonly PermissionOverrideInput[],
  now: Date = new Date()
): boolean {
  const active = overrides
    .filter((o) => o.permissionKey === permissionKey)
    .filter((o) => isOverrideActive(o, now))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .at(0)

  if (active) return active.allowed

  const defaults = roleDefaults instanceof Set ? roleDefaults : new Set(roleDefaults)
  return defaults.has(permissionKey)
}
