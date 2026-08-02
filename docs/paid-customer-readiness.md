# Paid-Customer Readiness

Roadmap phase 70, immediately after phase 69 (Post-Pilot Product
Pass), first phase after this roadmap sequence's own "we're almost
finished" checkpoint. Brief: "reach the point where charging is
responsible." Ten named requirements: real database proven, data
isolation proven, documents reliable, core workflows reliable, phone
experience polished, import works, support path exists, monitoring
exists, backup strategy exists, known limitations documented.

## Method

Rather than re-run every prior phase's verification from scratch, this
phase audited what already exists: for each of the 10 requirements,
either real, dated evidence already exists from an earlier phase (in
which case it's cited directly, not re-derived), or a genuine gap
exists (in which case it's fixed if in-scope, or honestly recorded if
not). `lib/platform/paid-customer-readiness.ts` is the resulting
list — same shape and same "plain, hand-updated fact list, never a
fabricated live status" reasoning as phase 67's
`lib/platform/launch-reliability.ts`, rendered as a third section on
the same `/platform/launch-gate` page (Performance, Reliability, now
Paid-Customer Readiness — three angles on one "are we ready" question,
matching phase 67's own precedent for adding a section rather than a
new nav item).

**No live-Supabase action was taken this phase** — the account holder
explicitly asked to handle the live database connection themselves as
its own separate task and to defer it until this phase sequence
finished. Every requirement below was evaluated from existing evidence
and local code/test changes only.

## Result: 7 of 10 pass, 3 fail — all 3 for the same reason

**Real database proven, Support path exists, and Monitoring exists all
fail**, and all three fail for the identical root cause: 5 migrations
(`usage_events`, `operational_events`, `pilot_feedback`,
`product_signals`, phase 66's launch-gate extensions) were built and
mock-tested across phases 58-66 but never applied to the live Supabase
project — a finding from phase 69, reconfirmed here, not rediscovered.
Real database auth/CRUD/RLS all check out live (phase 67's tenant-
isolation script); the schema serving founder-facing observability and
the in-app feedback form simply isn't there yet. This is a single,
already-tracked, already-deferred task — not three independent
problems — and resolving it would flip all three to pass at once.

**The other 7 pass, each with real evidence, not just a written
assertion**:

- **Data isolation proven** — phase 67's live tenant-isolation run,
  16/16 checks.
- **Documents reliable** — phase 7's 20/20 live pipeline checks, plus
  a real gap that check found but didn't fix, closed this phase (see
  below).
- **Core workflows reliable** — phase 61's 15-scenario test suite.
- **Phone experience polished** — phase 62's 11-operation phone
  simulation.
- **Import works** — phase 48's live mock-mode verification of the
  full read/preview pipeline; the write/commit path is reviewed by
  hand but not yet independently re-verified live, deferred alongside
  the migration task above rather than newly gapped.
- **Backup strategy exists** — phase 67's `docs/backup-and-restore.md`.
- **Known limitations documented** — the new consolidation this phase
  produced (see below).

## The one real fix this phase made

`docs/security.md`'s own "Known limitations, found but deliberately
not fixed" list (phase 7) named this exactly: **a failed DB insert
after a successful Storage upload could leave an orphaned file with
nothing referencing or cleaning it up** — true for all three
upload-recording server actions (`createDocumentRecord`,
`attachInspectionMedia`, `attachDamageMedia`). Given this phase's
brief is specifically "documents reliable" as a named bar for charging
real customers, this previously-deferred gap was closed: all three
actions now best-effort delete the just-uploaded Storage object when
the DB insert that was supposed to record it fails, before returning
the error — a compensating action, not an architecture change; the
upload is still two separate steps, a failure between them just no
longer leaves invisible waste behind. `docs/security.md` updated to
mark this fixed rather than silently going stale.

## The new deliverable: `docs/known-limitations.md`

The "known limitations documented" requirement's actual product:
consolidates every known gap from across this entire roadmap —
missing features, technical limitations, testing gaps, and the one
deliberately-unbuilt phase — into one document, each item pointing
back to where it was originally found rather than re-explaining it.
Previously this same information existed but was scattered across
roughly 20 individual phase docs plus session memory, with no single
place a business owner could read the whole list before deciding to
start charging.

## Verification

tsc/eslint/823 tests (815 existing + 8 new: 3 covering the
upload-cleanup fix in `lib/__tests__/document-upload-cleanup.test.ts`,
5 covering the new readiness-check list's own invariants in
`lib/platform/__tests__/paid-customer-readiness.test.ts`)/build all
clean. Live-verified in mock mode: unlike Overview's intelligence
extras, `/platform/launch-gate`'s underlying data functions
(`getUsageAnalyticsSummary`/`getOperationalSummary`/`getAiCallSummary`)
all have real mock-mode branches, so the page — including the new
"Paid-Customer Readiness" section — renders correctly without a live
Supabase project; confirmed directly in a real browser, all 10
requirements showing their correct Pass/Fail status and evidence text.
