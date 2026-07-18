import { getSessionContext, type SessionContext } from "@/lib/auth/session"
import type { EmployeeRole } from "@/types/rental"

/** Thrown by server actions for expected, user-facing failures (missing
 * permission, bad input, a conflicting booking). Action wrappers catch
 * this specifically and turn it into a normal `{ error }` result instead
 * of a 500 — anything else (a real bug) is left to surface as one. */
export class ActionError extends Error {}

/**
 * Every mutating server action starts by calling this — never by trusting
 * a `companyId` passed in from the client. The session is derived
 * server-side from the authenticated cookie, so there is no way for a
 * request to claim a different company.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext()
  if (!session) throw new ActionError("You need to sign in again.")
  return session
}

export function requireRole(session: SessionContext, allowed: EmployeeRole[]) {
  if (!allowed.includes(session.role)) {
    throw new ActionError("You don't have permission to do this.")
  }
}

/** Maps a Supabase/Postgres error to a message safe to show a non-technical
 * user. SQLSTATE 23P01 is the exclusion-violation raised by the
 * `reservations_no_overlap` constraint — see
 * supabase/migrations/20260718121000_double_booking_protection.sql. */
export function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23P01") {
    return "This vehicle is no longer available for the selected dates — someone else may have just booked it. Pick another vehicle or adjust the dates."
  }
  if (error.code === "23505") {
    return "That value is already in use."
  }
  return error.message
}
