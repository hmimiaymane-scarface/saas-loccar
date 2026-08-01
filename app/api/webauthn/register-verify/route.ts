import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { resolveWebAuthnParty, WEBAUTHN_CHALLENGE_COOKIE } from "@/lib/webauthn/config"

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? ""
  const match = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : null
}

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 })

  const expectedChallenge = readCookie(request, WEBAUTHN_CHALLENGE_COOKIE)
  if (!expectedChallenge) {
    return Response.json({ error: "That took too long — try again." }, { status: 400 })
  }

  const body = (await request.json()) as { response: RegistrationResponseJSON; deviceLabel?: string }
  const { rpID, origin } = resolveWebAuthnParty(request)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
  } catch {
    return Response.json({ error: "That didn't work — try again." }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return Response.json({ error: "That didn't work — try again." }, { status: 400 })
  }

  const { credential } = verification.registrationInfo
  const supabase = await createClient()
  const { error } = await supabase.from("webauthn_credentials").insert({
    company_id: session.company.id,
    user_id: session.userId,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    device_label: body.deviceLabel ?? null,
  })

  const clearCookie = `${WEBAUTHN_CHALLENGE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  if (error) {
    // Roadmap phase 57 — this used to pass the raw Postgres error.message
    // straight to the client (a technical-sounding string that could also
    // leak schema detail); a friendly fallback goes out instead, the real
    // error is still on the server for whoever checks logs.
    console.error("webauthn register-verify insert failed:", error.message)
    const response = Response.json({ error: "Could not save that. Try again." }, { status: 500 })
    response.headers.append("Set-Cookie", clearCookie)
    return response
  }

  const response = Response.json({ ok: true })
  response.headers.append("Set-Cookie", clearCookie)
  return response
}
