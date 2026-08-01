# Product Analytics / Usage Instrumentation

Roadmap phase 58. Brief: "Learn where owners struggle" — measure New
Rental started→completed, time to complete, Return started→completed,
drop-off step, search usage, quick-action usage, Home alert actions,
error rates, import completion, PWA installation where measurable.
"Done when: product decisions can use behavior instead of guesses."

This is meta-analytics about how rental companies use RentalOS itself,
for the SaaS operator's own product decisions — not a business-
intelligence feature for a tenant's own reporting. That framing drove
every design choice below: the event table has no tenant-facing SELECT
policy at all, and the only view onto this data lives in the
platform console (`/platform/analytics`), not anywhere a company
owner or employee can reach.

## What existed before this phase

Nothing. No analytics SDK in `package.json` (no PostHog/Mixpanel/
Amplitude/Segment/`@vercel/analytics`), no `lib/analytics`,
`lib/tracking`, or `lib/telemetry` module. The only prior client-side
"usage" persistence was purely local, non-aggregating, and never sent
anywhere: `lib/quick-actions-recency.ts`'s `localStorage` key (just
reorders the quick-actions sheet) and `install-prompt.tsx`'s dismiss
flag. This phase built the entire capture path — schema, write path,
and a read view — from scratch.

## Why not extend `activity_log`

`activity_log` (phase 01's event backbone) is a closed, hand-maintained
vocabulary (`ActivityType`/`EntityType` enums, CHECK-constrained) for
durable *business* audit events tied to one concrete entity — "a
reservation was confirmed," never "a wizard step was viewed." Usage
telemetry has no business entity, is expected to grow new event names
often, and would pollute `activity_log`'s own query surface
(`getEventsForEntity`/`getEventsByType`, used by the vehicle/customer
timeline and Operations Feed) if forced through it. `ai_usage_log`
(phase 05) already established the "purpose-built table for a
cross-cutting infrastructure concern" precedent this follows — see
that migration's own comment. The one deliberate difference: unlike
`ai_usage_log` (tenant-visible), `usage_events` has no SELECT policy
for company members at all, matching `platform_admins`' own
"insert-restricted, no SELECT for anyone but a SECURITY DEFINER
function" shape — see the migration file's header comment.

## Schema

`supabase/migrations/20260815090000_usage_events.sql`:

- `usage_events(id, company_id, user_id, event_type, session_id,
  entity_id, metadata jsonb, created_at)`. `event_type` is plain text,
  not a CHECK-constrained enum — an open vocabulary on purpose, so
  adding an event never needs a migration. Type safety for the fixed
  set of names this phase emits lives in TypeScript instead
  (`lib/analytics/events.ts`'s `UsageEventType` union).
- RLS: any company member can INSERT their own company's events
  (`is_company_member(company_id)`); no SELECT policy for anyone.
- Two read-side RPCs, `security definer`, gated by
  `assert_platform_admin()` (same pattern as every `platform_get_*`
  function in `20260721090400_platform_reads.sql`):
  - `platform_get_usage_summary(p_days)` — funnel counts (started/
    completed) and median completion time (seconds) for New Rental and
    Return, plus flat counts for every other measured event, over a
    trailing window.
  - `platform_get_dropoff_summary(p_flow, p_days)` — per-step "how many
    attempts (sessions) reached at least this step," derived from
    `<flow>_step_viewed` events (`new_rental_step_viewed` /
    `return_step_viewed`), counting a session's *furthest* step reached
    rather than raw view counts.

## The write path

`lib/analytics/track.ts`'s `trackUsageEvent(type, { sessionId?,
entityId?, metadata? })` is a `"use server"` action every
instrumentation point calls directly, fire-and-forget
(`void trackUsageEvent(...)`, never awaited for its result). It:

- Short-circuits immediately in mock mode (`!isSupabaseConfigured`) —
  same as every mutating action in this app, so it can never be
  exercised end-to-end in this environment, only reviewed by call site
  and confirmed to fire (a 200 OK server-action POST, no console error)
  without ever inserting a row.
- Derives `company_id`/`user_id` from the caller's own session
  (`getSessionContext()`) — callers never pass identity themselves,
  same convention as every other server action in this app.
- Never throws. A failed insert is logged server-side
  (`console.error`) and swallowed — this is fire-and-forget telemetry;
  it must never be able to break the UI action it's attached to.

## Where each brief item is measured

| Brief item | Event(s) | Where |
|---|---|---|
| New Rental started → completed | `new_rental_started`, `new_rental_completed` | `new-rental-wizard.tsx` |
| Time to complete rental | derived from the pair above (`platform_get_usage_summary`'s median) | — |
| Return started → completed | `return_started`, `return_completed` | `return-wizard.tsx` |
| Drop-off step | `new_rental_step_viewed` / `return_step_viewed`, every step including step 0 | both wizards, `platform_get_dropoff_summary` |
| Search usage | `search_opened`, `search_query_run`, `search_result_selected` | `command-palette.tsx` |
| Quick-action usage | `quick_action_used` | `quick-actions-sheet.tsx` |
| Home alert actions | `alert_action_used`, `alert_dismissed` | `needs-attention-section.tsx` |
| Error rates | `error_occurred` | `error.tsx` (crashes) + the two wizards' + import wizard's own failure branches |
| Import completion | `import_completed` | `import-wizard.tsx`, piggybacking on the already-computed commit result |
| PWA installation where measurable | `pwa_install_outcome`, `pwa_installed` | `install-prompt.tsx` |

### "Started" vs. "step viewed" — a deliberate distinction

Both wizards fire `<flow>_step_viewed` on every step, including step 0,
so the drop-off summary captures the full abandonment funnel — someone
who opens the New Rental wizard and leaves without picking a customer
is real signal about where owners struggle. But `<flow>_started` fires
later, at the *first genuinely committed action* (the step 0→1
transition, once a customer is actually selected or created) — not at
mount. Counting every page load as "started" would inflate the funnel
denominator with idle page visits that never attempted a rental at
all, corrupting "time to complete" and completion-rate numbers. The
Return wizard's "started" is closer to mount (it fires when the return
inspection is first created, which happens unconditionally on mount —
there's no earlier distinguishable user action there, unlike New
Rental's customer-selection step).

### Error rate — a scoped, not exhaustive, signal

There is no single chokepoint every server action's failure already
flows through in this app — each of the ~20 `actions.ts` files repeats
its own `try/catch` independently (confirmed by research before this
phase). Retrofitting a shared error-wrapper across the entire action
layer was out of scope for this phase; `error_occurred` instead covers:
the real crash boundary (`error.tsx`, excluding the mock-mode-only
"Supabase is not configured" crash, which is a demo-environment
artifact that would otherwise swamp real signal) and the specific
failure branches inside the three flows already being instrumented
(New Rental activation, Return completion, CSV import commit). This is
real, useful signal for the flows the brief actually names — not a
complete inventory of every possible action failure in the app.

### `entityId` must be a real UUID

`usage_events.entity_id` is a `uuid` column — the Needs Attention
cards' `card.id` is a composite string (e.g.
`"booking-request:<uuid>"`), not itself a UUID. Passing it as
`entityId` would make the *entire* insert fail (a bad UUID literal
fails the whole statement, not just that column), silently dropping
the event. It goes in `metadata.cardId` instead — anything without a
guaranteed-real UUID should follow the same rule.

## `/platform/analytics`

New page in the existing platform console (`app/platform/analytics/page.tsx`,
nav link added to `app/platform/layout.tsx`), following the exact
mock-mode-first pattern every other `/platform` page already uses
(`lib/platform-data.ts`'s `getUsageAnalyticsSummary()`/
`getDropoffSummary()`, `lib/mock/platform.ts`'s fixtures). Shows funnel
cards (started/completed/completion rate/median time, with a per-step
drop-off bar chart) for New Rental and Return, plus stat cards for
every other measured event. Deliberately not reachable from the tenant
dashboard — this is the SaaS operator's own view, not a report a
rental company owner should see about their own usage.

## Deliberately not built

- **No global action-layer error-tracking refactor.** See "Error rate"
  above — a real, scoped signal was chosen over a disproportionate
  rewrite of ~20 files' error handling.
- **No per-page list-filter search tracking.** The brief's "search
  usage" is read as the global command palette (`Cmd/Ctrl+K`), not the
  ~9 separate per-page `SearchInput` filter boxes (phase 56) — those
  are a materially different "filter this list" interaction, each with
  its own debounce/query logic, not one shared chokepoint.
- **No new client-side session/identity context.** `trackUsageEvent`
  derives `company_id`/`user_id` server-side from the caller's own
  session on every call — no company/user id prop-threading was needed
  through `CommandPalette`/`QuickActionsSheet`/`NeedsAttentionSection`,
  matching this app's existing "identity is a server-side concern"
  convention rather than inventing a new client-side session hook.
- **No `appinstalled`-only iOS signal.** Safari never fires
  `beforeinstallprompt` or `appinstalled` (unchanged from phase 44's
  own finding) — an iOS install is still only inferable indirectly (a
  later visit's `matchMedia("(display-mode: standalone)")` becoming
  true), which this phase didn't add new tracking for; it wasn't
  reliably attributable to a single moment worth an event.

## Verification

tsc/eslint/762 tests (757 existing + 5 new for `trackUsageEvent`,
covering mock-mode short-circuit, no-session short-circuit, a swallowed
insert error, and the row shape/attribution itself via a fake Supabase
client mirroring `lib/__tests__/activity-log.test.ts`'s pattern) /
build all clean at every checkpoint.

Live mock-mode verification confirmed, via network-request inspection
(every `trackUsageEvent` call is a real server-action POST, visible
even though it's a no-op server-side in mock mode): the Overview page's
alert-action click, the command palette's open and debounced query,
and the New Rental wizard's step-0 mount all fire their tracking calls
cleanly (200 OK, zero console errors) without altering the surrounding
feature's own behavior. `/platform/analytics` renders correctly against
the mock fixtures. Not separately click-verified: the mobile-only
quick-actions sheet (window resize didn't take effect in this browser
automation session), the Return and import wizards' tracking (same
`trackUsageEvent` call shape already proven elsewhere, tsc/lint clean),
the PWA install prompt (needs a real installable-PWA browser state),
and the crash boundary's `error_occurred` path (deliberately not
triggered live — see the codebase's own "avoid triggering dialogs/
crashes just to test them" caution).

One real mid-verification scare, not a code bug: after many live file
edits with the mock-mode dev server running, a stale Turbopack module
graph briefly made `error.tsx`'s new import of `trackUsageEvent`
throw a "module factory is not available" exception on load — the
exact known PWA-service-worker/stale-dev-cache class of issue this
project's own `AGENTS.md` and `docs/motion-polish.md` already document.
Fixed the same documented way (kill the dev server, `rm -rf .next`,
restart, unregister the service worker again in-browser) and confirmed
clean afterward — not a defect in the instrumentation itself.
