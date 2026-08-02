# Launch Performance Gate

Roadmap phase 66, seventeenth phase of Wave 8. Brief: "set hard
technical launch standards" — define acceptable targets for home load,
search, calendar, New Rental step transitions, photo upload, return
workflow, contract generation, error rate, and background jobs. "Done
when: performance has measurable acceptance criteria."

## What this phase found and built

Most of these 9 areas already had real, existing telemetry to check
against (phase 58's usage-funnel timing, phase 59's operational-events
error/slow-route tracking) — this phase's job was defining the actual
numbers and closing the two genuine measurement gaps that remained
(contract generation, photo upload had zero latency signal; search had
none at all), not building an observability system from scratch.

**The literal "measurable acceptance criteria" deliverable**: a new
`/platform/launch-gate` page (linked from the platform console's own
nav) showing all 9 criteria, each with its target, and — for the 7
that are automatically measurable — the real current value evaluated
against that target as Pass/Fail. The 2 that aren't automatically
measurable show "Not yet measured" with the manual method to use
instead, never a faked pass. `lib/platform/launch-gate.ts` is the
single source of truth: the 9 target definitions, the two new
threshold constants the real instrumentation below imports (so the
doc, the dashboard, and the actual logging code can never quietly
drift apart from each other), and the pure `evaluateLaunchGate()`
function (12 unit tests, `lib/platform/__tests__/launch-gate.test.ts`).

## The 9 criteria

| Area | Target | Measured how |
|---|---|---|
| Home load | Overview page: server response under 1.5s, interactive under 3s on a mid-tier mobile connection | **Manual** — Lighthouse/PageSpeed Insights against a real deployed URL, before each launch |
| Calendar | Same as Home load | **Manual** — same method |
| Search | Results within 800ms of the request | **Automatic** — new timing in `fetchCustomers` |
| New Rental step transitions | Median start→completion under 3 minutes | **Automatic** — already existed (`usage_events.new_rental_median_seconds`, phase 58) |
| Photo upload | Upload finishes within 8s on a typical mobile connection | **Automatic** — new timing in `uploadFile()` |
| Return workflow | Median start→completion under 2 minutes | **Automatic** — already existed (`usage_events.return_median_seconds`, phase 58) |
| Contract generation | PDF rendered and stored within 5s | **Automatic** — new timing in `generateContract()` |
| Error rate | AI call failure rate under 2%; ≤5 frontend + ≤5 API-route errors per rolling 7 days | **Automatic** — already existed (`ai_usage_log` phase 05, `operational_events` phase 59) |
| Background jobs | Zero unresolved cron job failures per rolling 7 days | **Automatic** — already existed (`operational_events` cron_job source, phase 59) |

## Why Home load and Calendar stay manual-only

Both are Server Component page renders, not a single async function
call with a clean start/end to wrap in timing code. Phase 59's own doc
already recorded this exact boundary: "No `instrumentation.ts`, no
timing code, anywhere, before this phase... `onRequestError` only
fires on errors, not on slow-but-successful requests" — generic
page-render timing needs real APM/Web-Vitals tooling (e.g. Vercel
Speed Insights), not something this phase invents. Defining a hard
number for these two and pairing it with an explicit, repeatable manual
check (Lighthouse/PageSpeed, before each launch) is the honest version
of "measurable acceptance criteria" here — a real target exists, it's
just checked by a human running a real tool, not a live dashboard.

## The two real instrumentation gaps closed, and how

**Contract generation** (`lib/contracts/template-store.ts#generateContract`)
— timed the actual cost of generating one contract (render the PDF +
store it in Supabase Storage), logging a `contract_generation` /
`warning` event via `logOperationalEvent` if it exceeds
`CONTRACT_GENERATION_SLOW_MS` (5000ms). This function is called from a
Server Action, not an API route, so `withRouteObservability` (phase
59) never covered it — a genuine gap until now.

**Photo upload** (`lib/storage-client.ts#uploadFile`) — already logged
upload *failures* (phase 59); now also times successful uploads and
logs a `warning`-severity `upload` event (reusing the existing source,
not a new one — a slow upload and a failed upload are both "something
wrong with an upload," the same category the dashboard already reports
on) if it exceeds `UPLOAD_SLOW_MS` (8000ms). The existing "Upload
failures" stat on `/platform/operations` now explicitly filters to
`severity = 'error'` so slow-but-successful uploads don't get counted
as failures there.

**Search** (`app/(dashboard)/reservations/actions.ts#fetchCustomers`)
— the one real server round trip the customer-search combobox (New
Rental wizard, reservation form) makes per keystroke, timed and logged
via a new `search` source if it exceeds `SEARCH_SLOW_MS` (800ms).

**Schema change**: `operational_events.source`'s CHECK constraint
extended from 6 to 8 values (`+ 'contract_generation', 'search'`) —
phase 59's own migration comment called this enum "unlikely to grow
casually," which this phase respects: both new values are explicitly
named, launch-gate-worthy categories from this phase's own brief, not
a casual addition. `platform_get_operational_summary()` extended to
report both new counts alongside the six it already tracked; new
"Slow contract generations" / "Slow searches" stat cards added to
`/platform/operations`.

## Why the pass/fail logic treats "zero slow events" as a pass, not "not measured"

For contract generation, photo upload, and background jobs, there is
no "total attempts" counter — only failures/slow instances are ever
logged (logging every single fast, successful action would be pure
noise, the same reasoning phase 59 already used). This means "zero
slow events in the window" can't be distinguished from "nothing
happened in the window at all." `evaluateLaunchGate()` treats this as
a pass by absence rather than "not measured," honestly documented in
code rather than silently assumed: zero evidence of a problem is a
reasonable default for a launch gate, and matches how a human would
read the same dashboard ("no incidents logged" reads as "fine," not
"unknown"). Search is handled differently on purpose — it has a real,
separate "was this used at all" signal (`usage_events.searchQueryRun`)
independent of the slow-event count, so it can honestly report "not
yet measured" when search has never been used, rather than a
false-by-default pass.

## Verification

tsc/eslint/807 tests (795 existing + 12 new in
`lib/platform/__tests__/launch-gate.test.ts`, covering the fixed
9-criterion list, the not-measured-until-used funnels, and every
pass/fail boundary)/build all clean. Live-verified in mock mode:
`/platform/launch-gate` renders all 9 criteria with a realistic mix of
Pass/Fail/Not-yet-measured against the mock fixtures (New Rental
transitions and Return workflow correctly fail on their mock medians
exceeding target; Error rate correctly fails on the mock's 4.2% AI
failure rate; Search and Contract generation correctly pass with zero
slow events logged); `/platform/operations` shows the two new stat
cards ("Slow contract generations," "Slow searches") alongside the
existing six, correctly reading 0 from the same mock fixture.
