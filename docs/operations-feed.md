# AI Operations Feed Engine

Roadmap phase 12 — bible Chapter 3 §4 ("a continuously updating
operational feed... the feed should always contain actions, never
information alone"), Chapter 5 ("Observe, Understand, Recommend,
Prepare"), Chapter 10 §5. The highest-leverage feature in the roadmap:
this is where the app stops being something you check and starts being
something that tells you what matters.

## Architecture

```
lib/operations-feed/
  types.ts        pure types — FeedItemDraft, PriorityTier, ObserverType
  thresholds.ts    every judgment-call number, named and justified
  observers.ts     8 pure decision functions (no Supabase)
  pricing-ai.ts    the one AI-assisted observer step
  run.ts           DB-facing orchestrator: fetch -> observe -> reconcile
  data.ts          read-side for the UI (getOpenOperationsFeedItems)
lib/supabase/admin.ts               service-role client (cron only)
app/api/cron/operations-feed/       the scheduled trigger
app/(dashboard)/operations-feed/    temporary end-to-end page
vercel.json                         daily cron schedule
```

Same pure-first/DB-second split every intelligence feature in this
codebase already uses (`vehicle-intelligence.ts`/`-store.ts`,
`customer-intelligence.ts`/`-store.ts`, `contracts/template-engine.ts`/
`template-store.ts`): every threshold decision lives in a function with
zero Supabase dependency, hand-fixture tested independently of the
database.

## No job-queue dependency: Vercel Cron

Requirement 1 asks to follow whatever's idiomatic for the stack rather
than add a new dependency. This app has genuinely no background-job
infrastructure of any kind — no `vercel.json` before this phase, no
Supabase Edge Functions, no queue package in `package.json`. For a
Next.js app whose natural deployment target is Vercel, Vercel Cron is
exactly the idiomatic, zero-new-dependency answer: a `crons` entry in
`vercel.json` pointing at a normal API route, authenticated via the
`Authorization: Bearer $CRON_SECRET` header Vercel attaches
automatically — no new package, no new infrastructure concept.

Scheduled daily (`0 6 * * *`) — conservative on purpose, since the
target deployment tier isn't known and daily is the safe, portable
default every Vercel plan supports; tightening the interval later is a
one-line change to `vercel.json`.

**The trigger and the logic are deliberately separate.** `runOperationsFeedForCompany()`
is a plain importable function — the cron route calls it once per
company, but so does `app/(dashboard)/operations-feed/actions.ts`'s
`runObserversNowAction` (an owner/manager-only "Run observers now"
button), so the whole feature is testable and demoable without ever
deploying to Vercel or waiting for the schedule.

## The service-role client: a deliberate, narrow exception

Every other Supabase client in this codebase uses the anon key plus
RLS plus the caller's own session cookies. A cron job has no session
cookies at all — Vercel Cron makes a bare HTTP request. `lib/supabase/admin.ts`
is the first real runtime use of `SUPABASE_SERVICE_ROLE_KEY` (it was
reserved in `.env.example` since early in the project for a seed
script that was never actually built). Used only by the cron route and
the manual-trigger action, both of which determine `company_id`
themselves before ever touching the client — RLS isn't there to catch
a missing scope check anymore, so that discipline has to hold by
convention. See the file's own doc comment for the full reasoning.

## The eight observers (requirement 1)

| Observer | AI? | Priority when triggered |
|---|---|---|
| Idle vehicle | No | business_health, or operational past 2x the threshold |
| Expiring document | No | critical if expired/≤3 days, else operational |
| Overlapping reservations | No | always critical |
| Unusual pricing | **Yes** (review only) | business_health |
| Inactive high-value customer | No | business_health |
| Vehicle health/profitability decline | No | business_health, operational if health <20 |
| Stale draft inspection | No | operational |
| Missing handoff photos | No | operational |

**Only one observer uses AI, deliberately** (requirement 8's cost
discipline). `findPricingOutliers` (pure z-score math) detects
candidates for free; what it can't know is whether a given deviation
is a legitimate business decision or a likely mistake — that's a
judgment call, and the one place in this phase `askAI` earns its cost.
One batched call reviews every outlier for the whole company in a
single request, never one call per candidate.

**"No output is a valid, good output"** (requirement 2) is enforced two
ways: every observer function returns `null`/`[]` far more often than
a draft (28 hand-fixture tests explicitly assert both the positive and
the quiet case for each one), and every threshold lives in
`thresholds.ts`, named and justified, so "why didn't this fire" always
has a real, inspectable answer.

**"Vehicle health decline" is honestly scoped**: the bible's phrasing
implies a trend, but `vehicle_intelligence` is upserted (overwritten)
on every recompute — there's no historical snapshot to compute a trend
from. This observer flags the *current* poor-health/negative-
profitability state instead, which is the more urgent and honestly-
supportable version of the same underlying concern. A future phase
could add real trend detection by appending snapshots instead of
overwriting; not attempted here.

## Reconciliation and dismissal (requirement 6)

`operations_feed_items` is keyed on `(company_id, observer_type,
entity_type, entity_id)` — re-running the job naturally reconciles
state instead of duplicating rows. Each run:
- A fresh detection with no existing row → **open**.
- A fresh detection matching an existing **open** row → refreshes its
  content and `last_seen_at`.
- A fresh detection matching an existing **dismissed** row → left
  completely untouched. The human's call stands even if the condition
  is still true — re-surfacing something someone already dismissed
  would be exactly the noise the bible warns against.
- An existing **open or dismissed** row whose condition *isn't*
  detected this run → **resolved**. A dismissed item that resolves and
  later reoccurs starts fresh as a new open item — the old dismissal
  doesn't follow it forever, only the specific occurrence it applied to.

Directly tested (not just asserted): a run detects an idle vehicle, the
vehicle gets a booking, a second run resolves that exact item; a
dismissed item survives an unchanged second run byte-for-byte.

## One-click actions (requirement 5)

Every feed item's `actionHref` is a real destination: `/fleet/[id]`,
`/customers/[id]`, `/reservations/[id]`, a `tel:` link for "Call," or
— for a stale inspection — `/reservations/[id]/pickup` or `/return`,
landing directly inside the existing guided workflow rather than
making someone re-find the reservation and start over, per the
requirement's own example. Dismiss is a real server action, not a
no-op.

## UI (requirement 3)

Reuses phase 02's `InsightFeedItem`, extended from 3 to 4 priority
tiers (`critical`/`operational`/`important`/`informational`) to
actually represent the bible's Chapter 10 §2 hierarchy — the original
3-tier version collapsed "today's operations" and "business health"
into one bucket, blurring exactly the distinction that hierarchy cares
about. A temporary `/operations-feed` page (requirement 7) gives an
end-to-end view; it's deliberately **not** added to the sidebar nav,
matching the requirement's own "temporary route" framing — phase 13
relocates this feed into the Command Center rather than rebuilding it,
sharing the same `getOpenOperationsFeedItems` read and
`OperationsFeedList` component.

## `askAI` now supports a system caller

`lib/ai/service.ts`'s `askAI()` previously required a real
`SessionContext` for every call. A background job has no signed-in
user — `ai_usage_log`'s own migration comment anticipated this
("phase 12's background jobs will call askAI() with no human actor...
role: 'system'/'ai'"), so `askAI` now accepts a `SystemCaller`
alongside `SessionContext` (a new `AskAiCaller` union) and skips the
`allowedRoles` permission check for it — there's no human permission to
gate when the job itself already decided the call should happen.

## Known limitations (intentional)

- **Live-Supabase-only**, same as every mutation-heavy domain since
  phase 04 — `run.ts` and `data.ts` call `createClient()`/expect a real
  client unconditionally. The temporary page degrades to an empty list
  in mock mode (verified live in the browser, light and dark, zero
  console errors); a populated feed's visual rendering was verified via
  the existing `/dev/intelligence-components` demo page instead, which
  already exercises `InsightFeedItem` across three of the four priority
  tiers with realistic bible-derived example text.
- **The `20260801090000_operations_feed.sql` migration hasn't been
  applied to the live Supabase project** — same recurring situation as
  every table since phase 03. The full observer run, reconciliation,
  and pricing-review AI call were verified instead via
  `lib/operations-feed/__tests__/run.test.ts`'s in-memory fake Supabase
  client, not against real Postgres.
- **No notification delivery** (email/push/WhatsApp) — explicitly
  phase 18, non-goal here. Items surface in-app only.
- **No predictive/forecasting observers** — stuck to the bible's
  Observe/Understand/Recommend examples, not the explicitly-future-scope
  Predictions section.
