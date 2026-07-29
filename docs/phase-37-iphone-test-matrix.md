# Real iPhone Test Matrix

Wave 5 phase 37. Brief: verify iOS-specific behavior — Safari, Add to
Home Screen, camera permissions, file uploads, offline recovery,
passkey/Face ID, keyboard and form behavior. "Done when: iPhone users
do not receive a second-class experience."

## Same limitation as phase 36, stated the same way

No physical iPhone, no real Safari-on-iOS, no Face ID sensor, no real
camera — this can't be executed from here, for the same reason phase 36
couldn't be. This is the iOS counterpart to that phase, and gets the
same honest treatment: a concrete plan grounded in the actual iOS-specific
code paths already built, not a fabricated "passed" result.

## Why iOS specifically needs its own pass, not just "mobile" in general

This app already has iOS-specific branching in several places — each
one is a real, plausible failure point that Android testing (phase 36)
cannot exercise:

- **`components/pwa/install-prompt.tsx`** — Safari never fires
  `beforeinstallprompt` (confirmed against Next.js's own PWA docs, not
  assumed), so iOS gets manual "tap Share, then Add to Home Screen"
  instructions instead of a one-tap install button. This is a
  completely separate code path from Android's, never exercised on real
  Safari.
- **`components/layout/mobile-bottom-nav.tsx` / `mobile-shell.tsx`** —
  both use `env(safe-area-inset-bottom)` / `-top` for the notch/Dynamic
  Island and home-indicator clearance. This CSS environment variable
  only means anything on a real notched device; nothing in a dev
  environment can render it meaningfully.
- **WebAuthn registration** (`app/api/webauthn/register-options/route.ts`)
  uses `residentKey: "required"` for a discoverable, no-email-needed
  passkey — iOS's Face ID/Touch ID passkey UI is a genuinely different
  system UI from Android's, with its own quirks (iCloud Keychain
  syncing behavior in particular).
- **Camera capture** (`components/domain/photo-upload-grid.tsx`,
  `document-scan-capture.tsx`) uses a plain `<input type="file"
  capture="environment">` — iOS Safari's camera-capture support via this
  attribute has historically been less consistent than Chromium's.
- **Offline queue** (`lib/offline/db.ts`, IndexedDB-based) — Safari has
  its own history of more aggressively evicting IndexedDB data under
  storage pressure than Chromium does; this is a real, iOS-specific risk
  to the exact feature phase 16 called "the hardest part" to build.

## Test matrix

Run every item below in **Safari** (the only browser engine that
matters on iOS — Chrome/Firefox for iOS are still WebKit under the
hood, so testing "Chrome on iPhone" doesn't actually cover anything
Safari doesn't).

| Area | What to actually do | What "pass" looks like |
|---|---|---|
| **Add to Home Screen** | Open the site in Safari, tap Share → "Add to Home Screen," relaunch from the home-screen icon | Opens standalone (no Safari chrome), correct icon/name, `InstallPrompt`'s iOS-specific instructions matched what was actually needed |
| **Safe areas** | On a notched/Dynamic-Island iPhone, open any mobile page | Content never sits under the notch or the home-indicator bar; the bottom tab bar has real clearance above the home indicator |
| **Camera permissions** | Open the pickup/return inspection photo grid or the customer-onboarding document scanner, tap a capture tile | iOS's native camera-permission prompt appears once, capture opens the camera (not just a generic file picker), a captured photo attaches correctly |
| **File uploads** | From the same capture tiles, tap and choose "Photo Library" instead of taking a new photo | An existing photo from the library uploads correctly, same as a fresh capture |
| **Offline recovery** | Start a pickup/return inspection, enable Airplane Mode mid-inspection, capture a photo or field, then restore connectivity | The offline-queued item still shows as captured immediately (no error), and syncs once back online — confirm nothing silently vanished after Safari backgrounds the tab |
| **Passkey / Face ID** | Register a passkey at `/profile`, sign out, sign back in | Face ID prompt appears at registration and at sign-in, both succeed, no fallback to password needed |
| **Keyboard behavior** | Open any form with text/number inputs (customer onboarding, reservation form, damage entry) | The keyboard doesn't cause the page to zoom in unexpectedly on focus; the correct keyboard type appears per field (numeric for amounts/odometer, done); dismissing the keyboard doesn't leave the layout shifted |
| **Scroll + bottom nav interaction** | Scroll a long page (e.g. a reservation detail) with the keyboard open, then closed | The fixed bottom tab bar never overlaps content or the keyboard's accessory bar |

## Known risk areas to watch for specifically

- **IndexedDB eviction under storage pressure** — Safari is documented
  to be more aggressive about this than Chromium; if a real
  low-storage or long-idle device silently drops queued offline data,
  that's a genuine iOS-specific bug this environment could never catch.
- **The passkey ceremony itself** — same caveat as phase 36's, doubled:
  this environment's synthetic clicks were never a "trusted user
  gesture" even for the Chromium path, and iOS's Face ID system sheet
  is an entirely different, never-yet-exercised UI.
- **`capture="environment"` reliability** — confirm it actually opens
  the rear camera directly rather than falling back to a generic file
  picker (behavior has varied across iOS/Safari versions historically).
- **Viewport zoom on input focus** — a classic iOS Safari behavior when
  an input's font-size is under 16px; worth a specific check across
  every form in the "sacred workflows," not just a spot check.

## What to do with the results

Same as phase 36: this document intentionally has no results filled in.
When real iPhone testing happens, record the honest outcome — what
passed, what didn't, on which iOS version/device — as a dated update
here, the same way every other phase in this roadmap has recorded its
real verification account.
