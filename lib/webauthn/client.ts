"use client"

import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser"

/** Roadmap phase 16 requirement 8 — the two browser-side ceremonies,
 * each a thin wrapper tying together this app's own options/verify
 * API routes (app/api/webauthn/*) with @simplewebauthn/browser's
 * ceremony functions. Deliberately not more abstracted than this —
 * there are exactly two call sites (profile registration, sign-in). */

export { browserSupportsWebAuthn }

export async function registerPasskey(deviceLabel?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const optionsResponse = await fetch("/api/webauthn/register-options", { method: "POST" })
  if (!optionsResponse.ok) {
    const body = await optionsResponse.json().catch(() => ({}))
    return { ok: false, error: body.error ?? "Could not start passkey registration." }
  }
  const options = await optionsResponse.json()

  let attestation
  try {
    attestation = await startRegistration({ optionsJSON: options })
  } catch {
    return { ok: false, error: "Passkey registration was cancelled or isn't supported on this device." }
  }

  const verifyResponse = await fetch("/api/webauthn/register-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: attestation, deviceLabel }),
  })
  const result = await verifyResponse.json().catch(() => ({}))
  if (!verifyResponse.ok) return { ok: false, error: result.error ?? "Could not save that passkey." }
  return { ok: true }
}

export async function signInWithPasskey(): Promise<{ ok: true } | { ok: false; error: string }> {
  const optionsResponse = await fetch("/api/webauthn/authenticate-options", { method: "POST" })
  if (!optionsResponse.ok) {
    const body = await optionsResponse.json().catch(() => ({}))
    return { ok: false, error: body.error ?? "Could not start passkey sign-in." }
  }
  const options = await optionsResponse.json()

  let assertion
  try {
    assertion = await startAuthentication({ optionsJSON: options })
  } catch {
    return { ok: false, error: "Passkey sign-in was cancelled or isn't supported on this device." }
  }

  const verifyResponse = await fetch("/api/webauthn/authenticate-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: assertion }),
  })
  const result = await verifyResponse.json().catch(() => ({}))
  if (!verifyResponse.ok) return { ok: false, error: result.error ?? "Could not sign in with that passkey." }
  return { ok: true }
}
