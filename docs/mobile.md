# Mobile Field Experience Foundation

**See `docs/mobile-design-system.md` (productization wave 1 phase 9)
for the spacing/type/touch-target/motion/haptics rules new mobile work
should follow** — this doc covers the phase-16 shell/offline/PWA
foundation those rules now sit on top of.

Roadmap phase 16 — bible Chapter 4 in full ("The mobile application is
not a smaller desktop... an entirely different product with the same
data"), Chapter 1 §6 ("Mobile First. Desktop Deep."), Chapter 2 §18
("Mobile and Desktop Are Different Products"). Flagged by the roadmap
itself as likely the largest phase in the whole 20-phase build,
explicitly sanctioning a split across sessions — built here in one
extended session instead, in full depth, across 8 checkpoint commits.

## The decision this phase had to make explicitly

**This is a Progressive Web App, not a native iOS/Android app.** Next.js
16 has first-class PWA support (`app/manifest.ts`, the `icon`/
`apple-icon` file conventions), confirmed by reading this version's own
docs before writing a line of code. A second native codebase would
directly contradict the bible's own Chapter 11 warning about "thousands
of different codebases" — the mobile experience shares this app's data
layer, auth, and business logic entirely; only the UI shell and a
client-side offline queue are genuinely new.

## A second, technically-forced scoping decision

**"Offline" means mid-flow resilience, not cold-launch-with-zero-connectivity.**
React Server Components require a live server round-trip by
construction — a service worker cannot render one offline. So: an
employee who was already using the app (even just moments earlier, with
some connectivity) can keep working through a pickup/return inspection,
photo capture, document scan, and signature capture with the network
fully disabled, and it syncs on reconnect. A employee cannot cold-launch
the installed PWA with zero connectivity *ever* having occurred and
open an arbitrary reservation for the first time — that reservation's
data has to have reached the device at some point. This is the literal
scenario the acceptance criteria describe ("an inspection can be
started, photos captured, and completed with the network disabled") —
not a compromise of it.

## Checkpoint 1 — Schema

One migration, four independent additions:
- `reservations.assigned_employee_id` (nullable) — "today's work for
  me" wasn't a real concept in the schema before this; unassigned stays
  visible to any agent, unchanged from every reservation's behavior
  before this field existed.
- `webauthn_credentials` table + RLS (`user_id = auth.uid()` only).
- Nullable + unique-per-company `idempotency_key` on `media`,
  `documents`, `damages` — lets the offline sync engine safely replay a
  mutation whose response was lost.
- `contract_signatures.signature_image_path` + an extended `method`
  check constraint (`'drawn_signature'` alongside the existing
  `'typed_name_confirmation'`) — that table's own original migration
  comment already anticipated this addition.

## Checkpoint 2 — PWA foundation

`app/manifest.ts` (Next's dynamic manifest — auto-injects the `<link
rel="manifest">` tag, zero manual wiring). Icons split two ways
deliberately: `app/icon.tsx`/`app/apple-icon.tsx` use Next's special
file conventions for the browser-tab favicon and iOS home-screen tag
(these get build-hashed URLs, which is fine — they're auto-linked, not
referenced by hand); a separate plain Route Handler,
`app/icons/[size]/route.tsx`, gives the manifest's own `icons` array
**stable, predictable URLs** (`/icons/192`, `/icons/512`,
`/icons/512-maskable`) it can reference directly — the special
conventions' hashed URLs aren't suitable for that.

Hand-rolled `public/sw.js`, not a library. Next's own PWA guide
recommends Serwist for offline support but flags it as requiring
webpack configuration; this repo builds with Turbopack, so that's not
just a dependency-avoidance preference here, it's the technically
correct choice. Three strategies, chosen per request:
1. `/_next/static/*` — cache-first (safe: Next hashes these filenames).
2. Navigations to the offline-critical routes (mobile home, pickup,
   return) — network-first, falling back to the last cached response
   for that exact URL, then to `/offline`.
3. Everything else — untouched, straight to the network. Mutating
   requests are never cached by the service worker; offline resilience
   for those is the IndexedDB queue's job entirely (checkpoint 5).

`InstallPrompt` (Chromium `beforeinstallprompt` capture + iOS manual
instructions, since Safari never fires that event) — this app's first
use of `localStorage`, for the dismiss flag only.

## Checkpoint 3 — A genuinely distinct mobile shell

Before this phase, "mobile" meant a hamburger drawer
(`components/layout/mobile-nav.tsx`) reflowing the identical desktop
nav tree — exactly the "copy desktop layouts onto mobile" the bible
warns against. `AppShell` now branches into `DesktopShell` (today's
`Sidebar`+`Header`, extracted verbatim, unchanged) and `MobileShell`
(new): a compact top bar with no page-title lookup (each mobile screen
owns its own heading, like every page already does via
`SectionHeader`), and a fixed 5-tab bottom bar
(`mobilePrimaryNav` — Home/Reservations/Fleet/Customers/Inbox, a
genuinely separate list from desktop's `primaryNav`, not a filtered
version of it) plus an elevated center button opening a quick-actions
bottom sheet (New Rental, Scan Document, Start Inspection, Return
Vehicle, Capture Damage, Search Customer — each routed to an existing
flow, no new destination pages). Settings/secondary nav lives on the
new `/profile` screen instead, never competing for one of the 5 tabs.

> **Superseded by productization wave 1 phase 10.** The 5-tab list
> above (Home/Reservations/Fleet/Customers/Inbox) and the per-role
> filtering on both the tabs and the quick-actions sheet no longer
> exist. The bottom bar is now 4 role-invariant tabs — Home, Calendar,
> Fleet, More — plus the same center "+" sheet, now always rendered and
> showing all 6 actions to every employee. Reservations and Customers
> moved into the shared `/more` hub instead of being primary tabs. The
> pre-phase-16 hamburger drawer (`components/layout/mobile-nav.tsx`)
> mentioned here as already-dead is deleted, not just unreachable. See
> `docs/mobile-design-system.md` for the current shell shape.

> **Further superseded by productization wave 2 phase 13.** The quick-
> actions sheet's 6 actions are no longer Scan Document/Start Inspection/
> Capture Damage/Search Customer — see `docs/quick-actions.md` for the
> current set and its recency-ordering mechanism.

Both shells are mounted at once (one hidden via CSS at the `lg`
breakpoint) rather than conditionally rendered — the same convention
the old `MobileNav` already used, and it avoids a hydration-timing
flash of the wrong shell. One real bug this surfaced and fixed:
mounting both shells meant each independently ran
`useCommandPalette()`'s global Cmd/Ctrl+K listener, so one keypress
opened two independent dialog instances at once. Fixed by lifting that
state to `AppShell` and passing a single `onOpenSearch` callback down.

## Checkpoint 4 — Mission feed home screen

`lib/mobile/mission-feed.ts` (pure) turns today's relevant reservations
plus the phase-12 operations feed's own already-reasoned items into one
ordered list of actionable cards — critical first, then operational,
then informational. Reuses `resolveReportPeriod("today", companyTimezone)`
for "what day is it" rather than reinventing timezone math (this
app already has a company-timezone-aware day-boundary helper; using
anything else here would have been a real correctness bug waiting to
happen). `/home` (the mobile shell's actual Home destination) renders
this; desktop's own `/overview` is completely untouched.

## Checkpoint 5 — Offline queue engine (the hardest part)

New dependency: `idb`, a tiny promise wrapper over IndexedDB. This app
had zero client-side persistence anywhere before this phase — hand-
rolling raw IndexedDB's callback-based transaction API for something
this data-integrity-sensitive was judged the wrong place to avoid a
dependency, unlike most of this codebase's other choices.

`lib/offline/db.ts`: two object stores — `mutations` (queued writes)
and `blobs` (captured photos/signatures as real `Blob`s, not
base64-inflated JSON). `lib/offline/sync.ts` drains the queue by
calling the *exact same server actions* a live interaction would — no
parallel data path. Three outcomes per mutation:
- **Real success**, or a rejection that just means "this was already
  applied" (e.g. re-completing an already-completed inspection — the
  harmless case an offline device replaying its own queue will
  actually hit) — removed from the queue.
- **A thrown exception** — the network is genuinely unreachable right
  now. Left `pending`, retried later; the rest of that sync pass stops
  (if one call couldn't reach the network, none of the rest can
  either).
- **A real, deliberate rejection** — moved to `needs_review`, never
  silently dropped or overwritten. This is the "conflict handling" the
  brief asks for, scoped honestly: genuine conflicts here are rare
  (inspections are single-operator drafts), so this path exists for the
  real exception, not routine syncing.

`attachInspectionMedia`/`createDocumentRecord`/`createDamage` each
gained an optional idempotency key (select-existing-before-insert)
using checkpoint 1's columns — a retried sync after a lost response is
a safe no-op, not a duplicate row.

## Checkpoint 6 — Wiring it into the actual workflows

`PhotoUploadGrid` and `DocumentUploadRow` both gained an optional
`onQueueOffline` callback: offline (or a Storage upload that fails with
a network-shaped error), the capture goes into the queue instead of
being lost, and the slot still shows "captured" immediately — **syncing
later is invisible infrastructure, not something a field workflow
should surface**. This principle shows up everywhere in this
checkpoint: the employee's experience of capturing a photo offline is
identical to capturing one online.

Both wizards: `saveInspectionFields` and photo/document capture are
queueable offline; `completeInspectionAction` is queued too, with
`dependsOn` set to every photo/document mutation queued earlier in the
same session (so sync order stays correct — photos before completion).
**`activateRentalAction`/`completeRentalAction` (the reservation-status
transition and payment/deposit finalization) deliberately stay
online-only** — a clear inline message explains this rather than
silently attempting a heavier chain this checkpoint couldn't verify is
safe to retry blindly against payment state. New `OfflineStatusBanner`
gives a quiet status line in both wizards, silent when fully synced.

New `components/domain/contracts/signature-pad.tsx` — a real drawn
signature via plain `<canvas>` + pointer events, no new dependency
(unlike WebAuthn's crypto ceremonies, this is well within hand-rolled
scope). `ContractSignatureSection` offers both draw (default) and the
existing typed-name+checkbox ("can't draw on this device" escape
hatch); the drawn path is offline-queueable through the identical
pipeline as photos/documents.

## Checkpoint 7 — Mobile AI inline nudges

`lib/mobile/inline-nudges.ts` (pure) composes two of the bible's named
proactive-assist examples — "you forgot to capture the rear," "this
vehicle already has reported damage" — from data the wizards already
have loaded, at **zero AI cost**: reuses phase 15's
`missingRequiredPhotoSlots` directly (one source of truth for "what's
missing," surfaced two ways: a hard block at completion, this softer
nudge earlier in the flow) and the already-fetched vehicle damage list.
Shown inline during the flow, not a separate chat, per requirement 7's
own framing ("Mobile AI assists" rather than waiting to be asked).

**Deliberately drops the bible's "licence expires next month" example**
— that would need the customer's licence expiry loaded into the
wizard's own data, which it isn't today. Adding that fetch was judged
out of this checkpoint's "reuse what's already loaded, no new AI call"
scope — a real, honest limitation, not an oversight.

## Checkpoint 8 — WebAuthn / biometric sign-in

New dependencies: `@simplewebauthn/browser` + `@simplewebauthn/server`
— passkey crypto ceremonies are not something to hand-roll. Four route
handlers under `app/api/webauthn/`, RP ID and origin derived from the
request itself (this app has no fixed deployment domain configured
anywhere) rather than a new environment variable.

Registration always requires a live session (from the new `/profile`
page, reachable by any role — a personal security setting, unlike
`/settings`, which stays owner/manager only). Every credential is
registered **discoverable** (`residentKey: "required"`), so sign-in
never asks for an email/username first — the browser's own passkey
picker offers it directly, and `authenticate-verify` identifies the
user from the assertion's own `userHandle` (the same user id that was
encoded into `userID` at registration time).

**The one genuinely non-obvious integration in this whole phase**:
Supabase Auth has no first-class WebAuthn support, so a verified
assertion has to be bridged into a real session by hand. The approach —
after `verifyAuthenticationResponse` succeeds, use the service-role
admin client (`lib/supabase/admin.ts`, built in phase 12 for exactly
this kind of narrow, documented exception) to generate a one-time
magic-link token server-side (`auth.admin.generateLink`), then
immediately redeem that *exact* token with the ordinary session-writing
client (`lib/supabase/server.ts#createClient`, the same one every other
authenticated request uses via `auth.verifyOtp`). Its normal
cookie-writing plumbing sets the real session cookies — from the
client's perspective this ends exactly like a password sign-in did. The
user never sees a magic-link email; it's generated and consumed
entirely server-side within one request. `lib/supabase/admin.ts`'s own
doc comment was widened to name this as the second (and only other)
legitimate caller of the service-role client, alongside the cron job —
both are, by definition, requests with no signed-in session yet.

A client-side idle-redirect (`hooks/use-idle-redirect.ts`, 30 minutes,
active only in `display-mode: standalone`) covers "automatic session
expiration" for the mobile context specifically — an installed PWA
left unattended in the field (handed to a customer, left on a counter)
is a real shared-device risk an office desktop generally isn't. This
does **not** revoke the underlying Supabase session server-side (a
heavier change out of this checkpoint's scope) — it redirects to
`/sign-in`, forcing a fast passkey re-auth back in front of anyone still
holding the device.

## Checkpoint 9 — Printing hand-off

No new flow. `ContractPdfActions`' Print button (`window.print()`) is
hidden below the `lg` breakpoint via CSS — mobile browsers handle the
native print dialog inconsistently, and the bible is explicit printing
isn't mobile's job. In its place, a Share button appears when the Web
Share API is available (most mobile browsers): handing a generated
contract off via WhatsApp/email/AirDrop is the realistic field
equivalent of "print it." Download stays available everywhere — the one
action that always works regardless of device.

## Known limitations (intentional)

- **Offline scope is mid-flow, not cold-launch** — see above. A
  proactive prefetch-while-online cache of today's assigned
  reservations (so a cold relaunch offline still opens a job that
  hasn't been visited yet today) was scoped into the original plan as
  a `snapshots` IndexedDB store but was not built in this pass —
  `lib/offline/db.ts` currently has `mutations` and `blobs` only. A
  real, deliberate scope cut given the size of everything else in this
  phase, not an oversight; worth a fast follow-up if cold-launch
  offline access becomes a real field complaint.
- **`activateRentalAction`/`completeRentalAction` require connectivity**
  — the reservation-status/payment/deposit finalization step, as
  opposed to the inspection record itself completing, which is fully
  offline-queueable. See checkpoint 6.
- **The mobile AI nudges cover 2 of the bible's 3 named examples** — no
  licence-expiry nudge (would need new data plumbing). See checkpoint 7.
- **No real device testing** — verified via mock-mode browser checks
  (an iframe at a genuine 390px viewport, since this environment's
  `resize_window` tool doesn't actually resize the browser — the same
  workaround discovered in phase 14) and Chrome DevTools' Application
  panel for manifest/service-worker/installability. No real iOS/Android
  hardware, no real WebAuthn authenticator ceremony (Face ID/Touch
  ID/Windows Hello) was exercised — the register button on `/profile`
  was clicked live in mock mode and produced no console error, but a
  synthetic click inside an injected iframe likely doesn't carry the
  "trusted user gesture" WebAuthn requires, so this only confirms the
  code path doesn't throw synchronously, not a completed ceremony.
  Verified instead by code review against `@simplewebauthn`'s own
  documented contract and a manual check that all four routes compile
  and respond with the expected shapes.
- **The offline-queue UI (checkpoint 6) could not be interactively
  exercised in mock mode this session** — confirmed live: both
  `/reservations/[id]/pickup` and `/reservations/[id]/return` crash
  immediately on load in mock mode, because `startInspection` fires
  from a mount `useEffect` and unconditionally calls `createClient()`,
  which throws "Supabase is not configured." This is the exact
  pre-existing gap documented in phase 15's `docs/damage-detection.md`
  (not something this phase introduced) — reconfirmed here because it
  specifically blocks live verification of this checkpoint's own new
  UI (the offline status banner, the "captured while offline" checkmark
  behavior). Verified instead by: the pure `isAlreadyAppliedMessage`/
  `isMutationReady` unit tests (checkpoint 5), full `tsc`/`lint`/build
  success across every file touched, and code review of the actual
  queueing logic. **Before this is trusted in the field, a real device
  pass (install, offline airplane-mode inspection start-to-finish,
  actual passkey registration+sign-in) is strongly recommended** — and
  fixing the pickup/return pages' mock-mode fallback (giving them the
  same graceful degradation most other pages already have) would also
  unblock this specific gap for future mock-mode verification passes.
- **Same recurring migration caveat as every phase since 03** — the
  live Supabase project still has migrations 03-16 unapplied; nothing
  in this phase was tested against a real Postgres/Storage backend.
