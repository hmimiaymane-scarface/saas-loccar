# Error Monitoring and Operational Observability

Roadmap phase 59. Brief: "know when the product breaks before the
customer explains it." Implement: frontend error monitoring, server
error monitoring, failed job visibility, failed notification
visibility, failed upload visibility, AI-call failure visibility,
slow-route tracking. "Done when: production problems leave evidence."

Same "platform operator's own concern, not tenant-visible" framing as
phase 58's `usage_events` — no tenant, including owners, can ever see
this data; it lives only at `/platform/operations`.

## Why a new table, not usage_events

`operational_events` (this phase) is deliberately a separate table from
`usage_events` (phase 58), even though both are platform-operator-only
meta-data: `usage_events` answers "how do people use the product"
(product behavior, funnels); `operational_events` answers "is the
product broken" (system health). Different question, different
consumer, different shape — `source` is a small closed CHECK enum
here (the *categories* of thing that can break are fixed by this
phase's own brief), where `usage_events.event_type` is deliberately
open text (expected to grow new product-flow names often).

AI-call failure visibility needed no new table at all — `ai_usage_log`
(phase 05) already records `success`/`error_code` on every `askAI()`
call, written on both the success and failure path. This phase only
adds a read (`platform_get_ai_call_summary`) surfacing what already
existed.

## Two write paths, on purpose

`lib/supabase/admin.ts` (the service-role client) carries its own
explicit, pre-existing rule: import it **only** from `app/api/cron/*`
route handlers or a module they call directly — never from a page, a
client component, or a normal server action reachable by an ordinary
signed-in request. That rule directly shaped this phase's design:

- **`lib/observability/log.ts`'s `logOperationalEvent()`** — the
  session-derived, RLS-gated path (mirrors `lib/analytics/track.ts`'s
  `trackUsageEvent()` exactly: mock-mode short-circuit, never throws,
  identity from the caller's own session, never passed in). Used by
  everything reachable from an ordinary signed-in request: the
  frontend error monitor, both crash boundaries, upload failures, and
  every non-cron API route via the wrapper below.
- **`lib/observability/log-admin.ts`'s `logOperationalEventAsAdmin()`**
  — the service-role path, for the two places in this app that
  genuinely have no session at all (Vercel Cron hitting a bare HTTP
  endpoint). Same two rules as `admin.ts` itself: only called from
  `app/api/cron/*`, and the caller must pass an explicit `companyId`
  it already determined (never implicit).

`operational_events`' own RLS insert policy (`is_company_member(company_id)`)
only needs to cover the first path — the second bypasses RLS by
service-role design, the same sanctioned exception `admin.ts` already
documents for exactly this kind of no-session background job.

## Where each brief item is covered

**Frontend error monitoring.** Next's `error.tsx`/`global-error.tsx`
only catch errors thrown during React's render/commit — never an
async event handler, `setTimeout`, or an un-awaited rejected promise
(confirmed: no `window.onerror`/`unhandledrejection` listener existed
anywhere before this phase). New `components/observability/error-monitor.tsx`
(mounted once in the root layout, same convention as
`ServiceWorkerRegister`) listens for both `window` `"error"` and
`"unhandledrejection"` and logs each. Separately, `global-error.tsx`
previously emitted **zero** telemetry at all — an asymmetry against
`app/(dashboard)/error.tsx` (wired since phase 58) — now fixed; a
crash reaching the root boundary is the worst case this app can have,
exactly what "production problems leave evidence" means. The dashboard
boundary now writes to **both** `usage_events` (phase 58's
`error_occurred`, product-usage signal) and `operational_events` (this
phase, system-health evidence) — different audiences, both worth
keeping, not a duplication to resolve away.

**Server error monitoring.** No shared error-wrapper existed across
this app's ~20 `actions.ts` files (confirmed by research), and
retrofitting all of them was judged disproportionate — the same
scope call phase 58 made for its own "error rate" item. What's
genuinely new and complete here: **every one of the 11 non-cron API
routes** (`app/api/exports/*` ×6, `app/api/webauthn/*` ×4,
`app/api/ai-assistant/chat`) is now wrapped with
`lib/observability/route-wrapper.ts`'s `withRouteObservability(routeName, handler)`
— an uncaught throw logs an `api_route` event before re-throwing (so
existing 500 behavior is unchanged), a response slower than 3s logs a
`slow_route` warning. Route handlers previously had zero safety net at
all (unlike Server Actions, which at least reach `error.tsx`) — this
closes a real, distinct gap, not just a rename of the existing crash-
boundary story.

**Failed job visibility.** Both cron routes
(`app/api/cron/operations-feed`, `app/api/cron/notification-reminders`)
already isolate per-company failures into a JSON response array — but
that JSON only ever reached whatever called the cron (Vercel's own
logs), never anything queryable inside this app. Both routes now also
call `logOperationalEventAsAdmin` (source `cron_job`) at the same two
points: the top-level company-list fetch failing, and each
per-company failure.

**Failed notification visibility.** `lib/notifications/channels/push.ts`'s
per-subscription send failure previously branched only on the expected
404/410 dead-subscription case (deletes the row) — any other failure
(network blip, provider outage) was silently swallowed with just a
code comment explaining why. Now logs a `notification` event for that
genuinely-unexpected case; the 404/410 path is unchanged (that's
correct behavior, not a failure worth recording).

**Failed upload visibility.** Uploads go straight from the browser to
Supabase Storage (`lib/storage-client.ts`, no server proxy) — a
failure there previously left zero server-side trace, just a client
toast. `uploadFile()` is the one shared chokepoint every upload call
site (~15 of them) already funnels through; it now logs an `upload`
event on failure there, rather than touching each caller individually.

**AI-call failure visibility.** No new writes — see "why a new table"
above. `platform_get_ai_call_summary` reads `ai_usage_log` directly.

**Slow-route tracking.** No `instrumentation.ts`, no timing code,
anywhere, before this phase (confirmed by research). `withRouteObservability`
times every wrapped route's handler and logs a `slow_route` warning
above 3000ms. Deliberately scoped to API routes only, not every Server
Component render or Server Action across the app — Next has no general
"wrap every render" hook without much heavier architecture
(`instrumentation.ts`'s `onRequestError` only fires on errors, not on
slow-but-successful requests), and API routes are where this phase's
own "server error monitoring" wrapper already had to exist anyway, so
the two line items share one mechanism.

## `/platform/operations`

New page (`app/platform/operations/page.tsx`), same mock-mode-first
pattern as every other `/platform` page: stat cards for each
`operational_events` source over a trailing 7-day window, an AI-call-
failure card from `ai_usage_log`, and a recent-events table (severity
badge, context, message, company, relative time) so a human can read
*what* happened, not just a count. Nav link added alongside Overview/
Companies/Analytics.

## Known, accepted limitations

- **Two webauthn routes run before any session exists**
  (`authenticate-options`, `authenticate-verify`) — if either throws
  pre-auth, `withRouteObservability`'s call to `logOperationalEvent`
  silently no-ops (no session to attribute the event to), same
  documented contract as `trackUsageEvent`. Not a gap specific to this
  wrapper.
- **The AI-assistant chat route's timing measures setup time, not full
  stream duration** — `streamText()`'s response resolves once headers
  are ready; the wrapper's `Date.now()` delta is time-to-first-byte,
  same as a reverse proxy would measure, not how long the full
  streamed reply took to finish.
- **No global action-layer error-tracking refactor** — same scope
  limit phase 58 already accepted for "error rate," now explicit for
  "server error monitoring" too: the ~20 `actions.ts` files' own
  scattered `try/catch` blocks are unchanged.

## Verification

tsc/eslint/774 tests (762 existing + 12 new: `logOperationalEvent`,
`logOperationalEventAsAdmin`, `withRouteObservability`, covering
mock-mode/no-session short-circuits, attribution, a swallowed insert
error, a swallowed `createAdminClient` throw, and the wrapper's three
paths — fast success/slow success/thrown error)/build all clean at
every checkpoint.

Live mock-mode verification confirmed: the root layout's `ErrorMonitor`
mounts with zero console errors; `/platform/operations` renders
correctly against the mock fixtures (stat cards, severity-colored
badges, recent-events table); and a direct `fetch("/api/exports/fleet")`
against a wrapped route returned its normal 200 with **exactly one**
network request — confirming a fast, successful call produces zero
side effects from the wrapper, matching its own unit tests. The
wrapper's error/slow-route branches were not separately forced live
(no safe way to trigger a genuine uncaught exception in a real route
without temporarily breaking it) — reviewed instead via the 12 unit
tests, which exercise both branches directly and pass.

One repeat of a previously-documented false alarm during this
session's verification: a stale Turbopack module graph (after many
live file edits with the mock-mode dev server running) briefly made
`error.tsx`'s import throw a "module factory is not available"
exception — the same class of issue already documented in
`docs/motion-polish.md` and `docs/product-analytics.md`. Fixed the same
documented way (kill the dev server, `rm -rf .next`, restart,
unregister the service worker again) and confirmed clean afterward —
not a defect in this phase's code.
