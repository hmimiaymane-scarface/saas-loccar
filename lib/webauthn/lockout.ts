/**
 * Roadmap phase 19 — WebAuthn authenticate-verify had no rate-limiting
 * of any kind before this: an attacker who knows or guesses a
 * credential_id/userHandle pair could retry indefinitely. Pure decision
 * logic, unit-testable without a live Supabase project — the route
 * (app/api/webauthn/authenticate-verify/route.ts) is the only thing
 * that actually reads/writes the `webauthn_credentials` row this
 * operates on.
 */
export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export interface LockoutState {
  failedAttempts: number
  lockedUntil: string | null
}

export function isLocked(state: LockoutState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && new Date(state.lockedUntil) > now
}

/** Called on a failed verification attempt. Only sets a lockout once
 * `failedAttempts` reaches the threshold — a lockout already in force
 * from a prior call is left as-is rather than extended further, so a
 * burst of retries against an already-locked credential doesn't keep
 * pushing the unlock time out indefinitely. */
export function recordFailedAttempt(state: LockoutState, now: Date = new Date()): LockoutState {
  const failedAttempts = state.failedAttempts + 1
  const lockedUntil =
    state.lockedUntil ?? (failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_DURATION_MS).toISOString() : null)
  return { failedAttempts, lockedUntil }
}

export function resetLockout(): LockoutState {
  return { failedAttempts: 0, lockedUntil: null }
}
