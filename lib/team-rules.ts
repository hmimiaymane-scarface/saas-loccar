import type { EmployeeRole } from "@/types/rental"

/**
 * Pure mirrors of the guard rules enforced by the membership-lifecycle
 * RPCs (`update_member_role`, `suspend_member`, `remove_member` — see
 * supabase/migrations/20260720090500_invitations.sql). The database is
 * what actually enforces these; this module exists so the same rules can
 * disable a button in the UI *before* a doomed request round-trips to
 * Postgres, and so they're unit-testable without a live project.
 *
 * Every function takes the same three facts the SQL functions check:
 * whether the actor is targeting themselves, whether the actor is an
 * owner or "only" a manager, and whether the target is the company's
 * last remaining active owner.
 */

export interface TeamActionCheck {
  allowed: boolean
  reason?: string
}

function ok(): TeamActionCheck {
  return { allowed: true }
}

function blocked(reason: string): TeamActionCheck {
  return { allowed: false, reason }
}

/** Shared by update-role, suspend and remove — none of them can ever be
 * self-directed or performed by anyone below manager. */
function baseCheck(actorRole: EmployeeRole, isSelf: boolean): TeamActionCheck | null {
  if (actorRole !== "owner" && actorRole !== "manager") {
    return blocked("Not permitted.")
  }
  if (isSelf) {
    return blocked("You cannot perform this action on your own membership.")
  }
  return null
}

export function canChangeRole(
  actorRole: EmployeeRole,
  isSelf: boolean,
  targetRole: EmployeeRole,
  targetIsLastActiveOwner: boolean,
  newRole: EmployeeRole
): TeamActionCheck {
  const base = baseCheck(actorRole, isSelf)
  if (base) return base

  if ((newRole === "owner" || targetRole === "owner") && actorRole !== "owner") {
    return blocked("Only an owner can grant or change ownership.")
  }
  if (targetRole === "owner" && newRole !== "owner" && targetIsLastActiveOwner) {
    return blocked("A company must always have at least one owner.")
  }
  return ok()
}

export function canSuspend(
  actorRole: EmployeeRole,
  isSelf: boolean,
  targetRole: EmployeeRole,
  targetIsLastActiveOwner: boolean
): TeamActionCheck {
  const base = baseCheck(actorRole, isSelf)
  if (base) return base

  if (targetRole === "owner" && actorRole !== "owner") {
    return blocked("Only an owner can suspend another owner.")
  }
  if (targetRole === "owner" && targetIsLastActiveOwner) {
    return blocked("A company must always have at least one active owner.")
  }
  return ok()
}

export function canRemove(
  actorRole: EmployeeRole,
  isSelf: boolean,
  targetRole: EmployeeRole,
  targetIsLastActiveOwner: boolean
): TeamActionCheck {
  const base = baseCheck(actorRole, isSelf)
  if (base) return base

  if (targetRole === "owner" && actorRole !== "owner") {
    return blocked("Only an owner can remove another owner.")
  }
  if (targetRole === "owner" && targetIsLastActiveOwner) {
    return blocked("A company must always have at least one owner.")
  }
  return ok()
}

export function canInvite(actorRole: EmployeeRole, invitedRole: EmployeeRole): TeamActionCheck {
  if (actorRole !== "owner" && actorRole !== "manager") {
    return blocked("Not permitted to invite members.")
  }
  if (invitedRole === "owner" && actorRole !== "owner") {
    return blocked("Only an owner can invite another owner.")
  }
  return ok()
}
