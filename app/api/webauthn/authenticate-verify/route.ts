import { verifyAuthenticationResponse, type AuthenticationResponseJSON, type WebAuthnCredential } from "@simplewebauthn/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { resolveWebAuthnParty, WEBAUTHN_CHALLENGE_COOKIE } from "@/lib/webauthn/config"
import { isLocked, recordFailedAttempt, resetLockout } from "@/lib/webauthn/lockout"

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? ""
  const match = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : null
}

/**
 * Roadmap phase 16 requirement 8 — step 2 of signing in with a
 * passkey, and the one genuinely non-obvious integration in this whole
 * phase: Supabase Auth has no first-class WebAuthn support, so a
 * verified assertion has to be bridged into a real Supabase session by
 * hand. No session exists at the start of this request by definition
 * (that's what we're establishing) — this is one of only two callers
 * in the entire app allowed to import lib/supabase/admin.ts's
 * service-role client (see that file's own doc comment).
 *
 * The bridge: once the assertion verifies, look up the user's email
 * with the admin client, mint a one-time magic-link token server-side
 * (`auth.admin.generateLink`), then immediately redeem that exact
 * token with an ordinary session-writing client
 * (`lib/supabase/server.ts#createClient`, the same one every other
 * authenticated request in this app uses) — its normal cookie-writing
 * plumbing sets the real session cookies on this response, so from the
 * client's perspective this ends exactly like a password sign-in did.
 * The user never sees the magic-link email; it's generated and
 * consumed entirely server-side in one request.
 */
export async function POST(request: Request) {
  const expectedChallenge = readCookie(request, WEBAUTHN_CHALLENGE_COOKIE)
  if (!expectedChallenge) {
    return Response.json({ error: "That took too long — try again." }, { status: 400 })
  }

  const body = (await request.json()) as { response: AuthenticationResponseJSON }
  const userHandle = body.response.response.userHandle
  if (!userHandle) {
    return Response.json({ error: "That didn't work — try signing in with your password instead." }, { status: 400 })
  }

  let userId: string
  try {
    userId = new TextDecoder().decode(Buffer.from(userHandle, "base64url"))
  } catch {
    return Response.json({ error: "That didn't work — try signing in with your password instead." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: credentialRow } = await admin
    .from("webauthn_credentials")
    .select("id, credential_id, public_key, counter, user_id, failed_attempts, locked_until")
    .eq("credential_id", body.response.id)
    .eq("user_id", userId)
    .maybeSingle()

  if (!credentialRow) {
    return Response.json({ error: "That didn't work — try signing in with your password instead." }, { status: 400 })
  }
  // Rebound to a definitely-non-null const — a nested function closing
  // over `credentialRow` directly wouldn't retain the null check above's
  // narrowing (TS doesn't narrow a closed-over outer variable inside a
  // function body), but a binding whose own declared type has no `null`
  // in it is captured correctly regardless.
  const credRow = credentialRow

  // Roadmap phase 19 — no rate-limiting existed on this endpoint before
  // this; see lib/webauthn/lockout.ts's own doc comment.
  if (isLocked({ failedAttempts: credRow.failed_attempts, lockedUntil: credRow.locked_until })) {
    return Response.json(
      { error: "Too many attempts — try again later or use your password." },
      { status: 429 }
    )
  }

  const credential: WebAuthnCredential = {
    id: credRow.credential_id,
    publicKey: new Uint8Array(Buffer.from(credRow.public_key, "base64url")),
    counter: credRow.counter,
  }

  const { rpID, origin } = resolveWebAuthnParty(request)

  async function recordFailure() {
    const next = recordFailedAttempt({ failedAttempts: credRow.failed_attempts, lockedUntil: credRow.locked_until })
    await admin
      .from("webauthn_credentials")
      .update({ failed_attempts: next.failedAttempts, locked_until: next.lockedUntil })
      .eq("id", credRow.id)
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
    })
  } catch {
    await recordFailure()
    return Response.json({ error: "That didn't work — try again." }, { status: 400 })
  }

  if (!verification.verified) {
    await recordFailure()
    return Response.json({ error: "That didn't work — try again." }, { status: 400 })
  }

  const reset = resetLockout()
  await admin
    .from("webauthn_credentials")
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
      failed_attempts: reset.failedAttempts,
      locked_until: reset.lockedUntil,
    })
    .eq("id", credRow.id)

  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError || !userResult.user?.email) {
    return Response.json({ error: "Could not sign you in. Try again or use your password." }, { status: 500 })
  }

  const { data: linkResult, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userResult.user.email,
  })
  if (linkError || !linkResult) {
    return Response.json({ error: "Could not sign you in. Try again or use your password." }, { status: 500 })
  }

  const supabase = await createClient()
  const { error: verifyOtpError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkResult.properties.hashed_token,
  })

  const clearCookie = `${WEBAUTHN_CHALLENGE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`

  if (verifyOtpError) {
    const response = Response.json({ error: "Could not sign you in. Try again or use your password." }, { status: 500 })
    response.headers.append("Set-Cookie", clearCookie)
    return response
  }

  const response = Response.json({ ok: true })
  response.headers.append("Set-Cookie", clearCookie)
  return response
}
