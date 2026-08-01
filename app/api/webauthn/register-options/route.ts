import { generateRegistrationOptions } from "@simplewebauthn/server"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { resolveWebAuthnParty, WEBAUTHN_CHALLENGE_COOKIE } from "@/lib/webauthn/config"
import { withRouteObservability } from "@/lib/observability/route-wrapper"

/**
 * Roadmap phase 16 requirement 8 — step 1 of registering a passkey for
 * an already-signed-in user (from the mobile profile screen's "Enable
 * Face ID / fingerprint sign-in"). Registration itself always requires
 * a live session — only *authenticating* with an already-registered
 * passkey happens before one exists (see authenticate-options/verify).
 */
async function handlePost(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 })

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("webauthn_credentials")
    .select("credential_id")
    .eq("user_id", session.userId)

  const { rpID } = resolveWebAuthnParty(request)

  const options = await generateRegistrationOptions({
    rpName: "RentalOS",
    rpID,
    userName: session.email ?? session.userId,
    userID: new TextEncoder().encode(session.userId),
    userDisplayName: session.profile.fullName ?? session.email ?? "RentalOS user",
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id as string })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  })

  const response = Response.json(options)
  response.headers.append(
    "Set-Cookie",
    `${WEBAUTHN_CHALLENGE_COOKIE}=${options.challenge}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300`
  )
  return response
}

export const POST = withRouteObservability("webauthn/register-options", handlePost)
