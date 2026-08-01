# Authentication Simplification

Roadmap phase 57, eighth phase of Wave 8 ("Polish, Observability,
Security, and Launch Confidence"), directly after phase 56. Brief:
"make login secure without making it feel technical." Owner-facing
language should say "Email / password" and "Use Face ID / fingerprint"
where supported; do not foreground "WebAuthn" or "Passkey" terminology
unless necessary. "Done when: security feels convenient rather than
advanced."

This is a copy/labeling pass only — the underlying WebAuthn/passkey
authentication mechanism itself (added in phase 16, hardened in phase
19) is unchanged. Nothing was re-architected; only what the owner
reads was rewritten.

## Audit approach

A dedicated research pass found every place "WebAuthn" or "Passkey"
appears as actual rendered UI text (not code comments, not internal
names) across the whole app, plus every user-facing error string in
the registration/sign-in flow.

**Headline finding**: "WebAuthn" never appeared as rendered text
anywhere — that part of the brief was already satisfied before this
phase started. "Passkey"/"Passkeys" appeared in exactly 7 rendered
strings, plus roughly a dozen error strings across the client-side
fallback module and two API routes, all repeating the word.

## What was fixed

**`components/domain/profile/passkey-section.tsx`** (the Profile
page's enrollment/management card):
- Card heading "Passkey sign-in" → **"Quick sign-in"**. Its own
  description already correctly said "Use Face ID, a fingerprint, or
  your device's screen lock" — the heading repeating "Passkey" right
  above that was the one place this card foregrounded the technical
  term.
- "Passkeys aren't supported on this browser." → **"Face ID /
  fingerprint sign-in isn't available on this browser."**
- The per-row remove button's `aria-label` (screen-reader only, never
  visible text) softened from "Remove passkey" to "Remove this
  sign-in method," for consistency though lower priority since sighted
  users never see it.
- Left unchanged: "Enable Face ID / fingerprint sign-in" (the CTA
  button) — already matches the brief's own preferred phrasing
  exactly, nothing to improve.

**`components/auth/passkey-sign-in-button.tsx`** (the actual sign-in
page): "Sign in with a passkey" → **"Use Face ID / fingerprint"** —
the exact phrase the brief names, replacing the one passkey-specific
label a returning owner sees every time they sign in.

**`lib/webauthn/client.ts`**'s 6 client-side fallback error strings
(used when a request fails before the server even returns a body —
network failure, a cancelled OS-level prompt) — all reworded to short,
reassuring phrasing that doesn't name the underlying mechanism at all:
e.g. "Passkey registration was cancelled or isn't supported on this
device." → "That was cancelled, or isn't supported on this device."

**`app/api/webauthn/register-verify/route.ts` and
`authenticate-verify/route.ts`**'s server-side error strings — same
treatment, several now explicitly pointing back at the password
fallback ("...try signing in with your password instead") since
that's always available and is exactly the "convenient, not advanced"
framing the brief asks for. `register-options/route.ts`'s one string
("Sign in first.") was already plain; `authenticate-options/route.ts`
has no error strings at all (never fails, by design) — neither needed
changes.

**Real bug fix found alongside the copy work, not just wording**:
`register-verify`'s DB-insert failure path returned the raw Postgres
`error.message` straight to the client in the response body (status
500) — a technical-sounding string that could also leak schema detail
in the worst case. Now logs the real error server-side via
`console.error` and returns a plain "Could not save that. Try again."
to the client instead. This is the one place in the whole audit where
a raw, unwrapped internal error could have reached the UI verbatim.

## Deliberately not changed

- **Internal naming** — `lib/webauthn/*`, `app/api/webauthn/*` route
  paths, the `webauthn_credentials` table/column names, code comments
  throughout, and this repo's own docs (`docs/security.md`, `AGENTS.md`)
  all still say "WebAuthn"/"passkey" freely. None of this is
  user-facing — renaming internal identifiers to match owner-facing
  copy would be pure churn with no benefit to the actual "done when"
  criterion (an owner never reads a route path or a table name).
- **No onboarding-time enrollment prompt was added.** The brief is
  about how existing screens are *worded*, not about adding a new
  first-run flow nudging owners toward Face ID/fingerprint setup —
  that's a product decision beyond this phase's stated scope, and
  enrollment remains reachable from Profile, same as before.
- **The device-label auto-detection logic** (`"iPhone/iPad"`/
  `"Android device"`/`"This device"`, derived from `navigator.userAgent`
  sniffing) was left as-is — it's already presented as a plain device
  name in the passkey list, never using jargon, so there was nothing
  to simplify there.
- **The lockout mechanism** (`lib/webauthn/lockout.ts`) itself has no
  user-facing strings and wasn't touched — only the message shown when
  a lockout triggers ("Too many attempts — try again later or use your
  password") was reworded, in `authenticate-verify/route.ts`.

## Verification

tsc/eslint/757 tests/build clean at every checkpoint (grepped for
test dependencies on each changed string first — none existed).
Live mock-mode browser check confirmed the sign-in page shows "Use
Face ID / fingerprint" (when the browser reports WebAuthn support)
and the Profile page's card now reads "Quick sign-in" with the
unchanged Face ID/fingerprint description directly beneath it. The
actual registration/authentication ceremonies themselves (and
therefore the reworded error-path strings, which only render on a
real failure) could not be exercised end-to-end in mock mode or
without a real platform authenticator in this environment — reviewed
instead by reading the exact code paths each string sits on.
