/**
 * Roadmap phase 16 requirement 8 — RP ID and origin are derived from
 * the incoming request itself rather than a hardcoded production
 * domain (this app has no fixed deployment domain configured anywhere
 * in the codebase) — standard WebAuthn practice, and it means this
 * works unmodified in local dev (`localhost` is a WebAuthn-recognized
 * secure-context special case) and in any preview/production
 * deployment without a new environment variable.
 */
export function resolveWebAuthnParty(request: Request): { rpID: string; origin: string } {
  const url = new URL(request.url)
  const originHeader = request.headers.get("origin")
  return {
    rpID: url.hostname,
    origin: originHeader ?? url.origin,
  }
}

export const WEBAUTHN_CHALLENGE_COOKIE = "webauthn_challenge"
