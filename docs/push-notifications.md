# Push Notifications (roadmap phase 44, wave 6 "Communication and Retention")

Goal: make RentalOS part of the owner's day without requiring them to
remember to open it. "Done when": push works reliably on supported PWA
devices and deep-links to the exact action.

## The real starting point (read before assuming anything below already worked)

Before this phase, `push` was one of four identically inert
placeholder channels (`lib/notifications/channels/unconfigured.ts`) —
phase 18 built the whole channel-agnostic `notify()` architecture
around it but never implemented delivery. More importantly, auditing
this phase's five priority conditions found that **four of them
(late return, upcoming pickup, upcoming return, outstanding balance)
were never actually sent anywhere at all** — they only existed as
live-computed values for the Overview dashboard's alerts widget
(`getLiveAlerts`), which is a deliberate design choice stated directly
in the `notifications` table's own migration comment: "a permanent row
would just be a second, easily-stale copy of the truth." Nothing ever
called `notify()` for these in real application code (confirmed:
grepped for actual `notify()` call sites — only the test file called
it before this phase).

Push can't work the "recompute live" way — a push has to fire at a
real point in time, with nobody looking at a page for it to
recompute against. This phase had to build the missing bridge, not
just the missing channel.

## What's new

### 1. The real push channel + subscription infra

- `push_subscriptions` (migration) — one row per browser/device a user
  enables push on, same per-user/no-company-visibility shape as
  `webauthn_credentials`.
- `web-push` npm dependency, VAPID keys in `lib/env.ts`/`.env.example`
  (generate a real pair with `npx web-push generate-vapid-keys`).
- `lib/notifications/channels/push.ts` — the real `send()`, using the
  service-role admin client (push is overwhelmingly triggered by a
  cron about *other* users' reservations, not the current session),
  fanning out to every one of a recipient's subscriptions in parallel,
  self-healing by deleting a subscription the push service reports
  gone (404/410).
- `usePushSubscription` (hook) + `PushNotificationSection` (Profile
  page, matching `PasskeySection`'s exact per-device/no-role-check
  shape) — the enable/disable UI. Permission is only ever requested
  from inside a click handler, never auto-prompted on mount (browsers
  refuse that regardless).
- `public/sw.js` gains its first `push`/`notificationclick` listeners
  — the actual deep-link mechanism (focuses an already-open tab at the
  right page if one exists, else opens a new one).

### 2. The missing bridge: a reminder cron

`lib/notifications/reminders.ts` (new) reuses `getLiveAlerts`'s exact
same filters for late-return/outstanding-balance (not reinvented —
same conditions, same query shapes) and adds two genuinely new
detections (upcoming pickup/return within a 2-hour window — nothing
computed this anywhere before). For each candidate, it claims a dedupe
slot in the new `push_notification_log` table (a unique
`(user_id, dedupe_key)` insert; a conflict means this exact occurrence
already got pushed) and, only on a successful claim, calls `notify()`
with **`channels: ["push"]` only — never `"in_app"`** — deliberately
keeping the `notifications` table's existing "state, not stored
events" design intact rather than reintroducing the stale-duplicate
problem it was built to avoid.

`push_notification_log` is a **deliberately separate mechanism** from
`notifications.key`'s dismissal-marker unique index — conflating them
would be a real bug: a dismissed-but-not-yet-pushed alert would never
push, and a pushed-but-not-dismissed alert would vanish from the
dashboard. Different concerns, different table.

A fifth condition — an important missing document — reuses
`lib/customer-readiness-store.ts#getUpcomingReservationsMissingIdentityDocument`,
the exact function the dashboard's own Needs Attention feed already
computes this from, not a second implementation. This one needed a
genuinely new `NotificationType` (`identity_document_missing`), added
via migration + the TS union.

New cron route `app/api/cron/notification-reminders/route.ts` (every
15 minutes — the daily Operations Feed cron's schedule is far too
coarse for "pickup in 2 hours") + a dev-run action/button on the
notifications page, same "test without deploying to Vercel or waiting
for the schedule" reasoning as the Operations Feed's own dev trigger.

**Vercel plan note**: a 15-minute cron interval requires at least a
Vercel Pro plan — the Hobby tier limits cron jobs to once per day.
Documented here since it isn't obvious from `vercel.json` alone.

### 3. New booking request — event-triggered, not cron-based

Unlike the other four conditions, a new booking request is a genuine
one-off event with no ongoing state to re-derive — it matches
`notifications`' own "genuine one-off events" category exactly. Fired
directly from `insertReservation` (the shared function behind both
`createReservation` and `createReservationInWizard`) when
`status === "request"`, through **both** `in_app` and `push` (a real
stored row is correct here, unlike the cron's four conditions).
Best-effort — a push failure never turns a successful reservation
creation into an error response, same convention as
`recomputeVehicleIntelligenceBestEffort`.

`lib/notifications/recipients.ts#getOwnerManagerRecipients` is shared
by both this and the reminder cron rather than duplicating the same
`company_memberships` query twice.

## What this phase deliberately didn't do

- **Did not build a per-notification-type opt-out for push** — every
  priority type pushes to every owner/manager with push enabled on
  their device. A finer-grained "push me for overdue but not for
  upcoming pickups" preference is a real, reasonable future addition,
  out of this phase's scope.
- **Did not key reminder dedupe on anything beyond `type:entityId`** —
  a reservation whose pickup time changes *after* it already triggered
  a push for entering the "approaching" window won't get a second push
  for the new time. Stated as a deliberate simplicity trade-off in
  `lib/notifications/reminders.ts`'s own doc comment, not an oversight.
- **Did not extend push to agent/accountant/driver roles** — recipients
  are owner/manager only, matching the brief's own "part of the
  *owner's* day" framing.
- **Did not add per-notification-type unit tests for `reminders.ts`**
  — it's DB-orchestration code in the same vein as
  `lib/operations-feed/run.ts`, which itself has no exhaustive unit
  suite either (the pure pieces it composes — `getOwnerManagerRecipients`'s
  query shape, `getUpcomingReservationsMissingIdentityDocument`,
  `callAndOpenActions`, `notify()` — are each already tested
  elsewhere). Consistent with this repo's established pure/DB split
  testing convention, not a gap unique to this phase.

## Verification account (honest about what a live push round-trip actually needs)

Real browser pass in mock mode confirmed: the Profile page's Push
Notifications section renders correctly, the "Enable on this device"
button is clickable and enters its busy/spinner state, and introduces
zero new console errors.

**A genuine tooling limitation, not a code gap, blocked the rest**:
native browser permission prompts (`Notification.requestPermission()`)
render as OS/browser-chrome UI *outside* the page's DOM and viewport —
they cannot be screenshotted or clicked through this environment's
browser-automation tools, which only see and interact with page
content. `Notification.permission` was confirmed to stay `"default"`
indefinitely rather than resolving, meaning `subscribe()` never got
past the permission-request step in this pass. This is the same class
of gap as every prior phase's "can't run EXPLAIN ANALYZE without live
Postgres" — a real environment constraint, stated plainly rather than
faked.

What **was** verified, calibrated to what's actually reachable:
- Generated a real (test-only, not committed) VAPID key pair with
  `npx web-push generate-vapid-keys` and confirmed the Profile page's
  guard correctly reads `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and attempts the
  real subscribe flow rather than short-circuiting — the only reason
  the test stopped at the permission prompt was the tooling limitation
  above, not a config or code issue.
- Service worker registration itself (`navigator.serviceWorker.controller`)
  was confirmed active and controlling the page.
- The `push`/`notificationclick` handler logic was verified by direct
  code review — both are plain, deterministic JavaScript with no
  external dependencies to mock.

**Before this feature is trusted in production**: a human with a real
device (or a browser session where they can personally click "Allow"
on the permission prompt) should complete one real end-to-end
subscribe → push → notification-tap → deep-link cycle. This is a
materially bigger gap than this project's usual "mock mode has no live
Supabase" caveat — it's specifically that *no automated tool in this
environment can drive a native permission grant*, which is true
regardless of Supabase configuration.

tsc/eslint/694 vitest tests/`next build` all clean at every checkpoint
(no new tests added — see the "deliberately didn't do" section above
for why).
