import { generateAuthenticationOptions } from "@simplewebauthn/server"

import { resolveWebAuthnParty, WEBAUTHN_CHALLENGE_COOKIE } from "@/lib/webauthn/config"

/**
 * Roadmap phase 16 requirement 8 — step 1 of signing in with a passkey.
 * Deliberately does NOT ask for an email/username first and does NOT
 * set `allowCredentials` — every credential registered by
 * register-verify's route is a discoverable (resident-key) credential,
 * so the browser's own passkey picker can offer it directly, and
 * authenticate-verify identifies which user it belongs to afterward
 * from the assertion's own `userHandle`. No session exists yet by
 * definition — this route is intentionally unauthenticated.
 */
export async function POST(request: Request) {
  const { rpID } = resolveWebAuthnParty(request)

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  })

  const response = Response.json(options)
  response.headers.append(
    "Set-Cookie",
    `${WEBAUTHN_CHALLENGE_COOKIE}=${options.challenge}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300`
  )
  return response
}
