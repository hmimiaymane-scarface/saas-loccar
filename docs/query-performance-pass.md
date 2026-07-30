# Database Query and Index Pass (roadmap phase 42)

Goal: ensure real datasets remain fast. "Done when": common owner
actions remain fast with realistic data volume.

## Method, and its one real limitation

**No live Postgres access exists in this environment** — same
constraint every phase since 03 has carried, re-verified for this
phase specifically: no Docker (`docker` isn't installed), no
`DATABASE_URL`/connection string in `.env.local` (only
`NEXT_PUBLIC_SUPABASE_URL`/anon key/service-role key — enough for
PostgREST calls, not enough for `psql`/raw SQL/`EXPLAIN ANALYZE`), and
the Supabase CLI's `db push`/local dev both need either Docker or a
linked project's DB password, neither available here.

**This means "measured, not judged by feeling" for this specific phase
means something different than phase 41's Navigation Timing captures**:
it means a real, systematic cross-reference of every named review
area's actual query code against every actual `CREATE INDEX` statement
across all 68 prior migration files — not a guess at what "might" be
slow, and not a fabricated benchmark. Every finding below points at a
specific `lib/*.ts` line and a specific migration file (or the absence
of one). What it can't do is prove the *magnitude* of the improvement
with a real query plan — that requires a human with actual database
access to run `EXPLAIN ANALYZE` before/after applying this phase's
migration, same standing ask as every schema-touching phase before it.

## What was reviewed and found already properly indexed

Stated plainly rather than silently skipped — several of the 9 named
areas turned out fine on inspection:

- **Operations Feed observers** (`lib/operations-feed/run.ts`) — the
  reconciliation query's exact `(company_id, observer_type, entity_type,
  entity_id)` tuple is backed by a real `unique(...)` constraint
  (`20260801090000_operations_feed.sql:41`), which already creates the
  matching index. Every per-observer fetch is a plain `company_id` scan
  against a table that already has a `company_id`-leading index.
- **Reservation queries** (list/detail, calendar ranges) — `pickup_at`,
  `return_at`, and `status` each already have their own
  `(company_id, ...)` composite index
  (`20260718120400_customers_reservations.sql:68-70`). Not a perfect
  single composite for status+date-range together, but Postgres can
  bitmap-AND two decent indexes reasonably well — not worth a new
  index for a query shape only calendar/report pages hit.
- **Reporting's `outstandingBalanceMad` query** (`getFinancialReport`,
  `lib/data.ts:4068-4070`) — filters `company_id` + `status not in
  (cancelled, no_show)` with **no date bound at all**, which looks like
  a missing-index smell at first glance. It isn't one: outstanding
  balance is genuinely a point-in-time total across every unpaid
  reservation ever, not scoped to the report's date range — adding a
  date filter would silently make old unpaid balances disappear from
  the number, a real correctness bug, not a performance fix. A `NOT IN`
  predicate over 2 excluded statuses out of ~7 total also isn't
  selective enough for a status index to meaningfully help regardless
  — the honest fix at real scale would be a maintained running balance
  (an aggregate updated on write, not summed on every read), which is a
  genuinely different, larger piece of work than "add an index" and is
  explicitly out of this phase's scope.
- **Every table filtered by `company_id`** (the one universally-applied
  predicate in this app) already has `company_id` as at least the
  leading column of some index — no table was found relying on a
  full/PK-only scan for tenant scoping.

## What was found genuinely missing, and fixed

One new migration, `20260809090000_phase42_query_performance_indexes.sql`,
adds exactly these and nothing else:

1. **`pg_trgm` + GIN trigram indexes** on `customers.full_name`,
   `vehicles.registration_number`, `reservations.reference` — the
   customer-search, plate-search, and reservation-search/global-search
   `ilike('%q%')` queries (`lib/data.ts`, `lib/search.ts`) all do a
   leading-wildcard substring match, which **no plain btree index can
   ever help**, regardless of column order. `pg_trgm` is a standard
   Postgres contrib extension (bundled with Supabase, not a new
   external dependency) that makes a GIN index actually useful for
   `LIKE '%x%'`. Scoped to exactly the three columns this phase's named
   areas call out — not every `ilike` column in the app (`vehicles.make`/
   `model`, `contracts.contract_number` are lower-cardinality columns
   where a full scan is already cheap; adding trigram indexes there
   would be indexing for its own sake, not a confirmed need).
2. **Three expression indexes on `activity_log`'s JSON metadata** —
   `getActivityLogList`'s `metadata->>'reservation_id'`/`'vehicle_id'`
   filters and `getCustomerTimeline`'s `metadata->>'customer_id'`/
   `'reservation_id'` filters had **zero** index support before this —
   every vehicle detail page's timeline, every customer detail page's
   timeline, and the reservation-scoped activity filter all fell
   through to a `company_id`-prefix scan plus a per-row JSON-text
   comparison. Partial indexes (`WHERE ... IS NOT NULL`) since most
   activity rows don't carry every one of these keys.
3. **A real composite for the notification feed** — `company_id,
   user_id, created_at desc`, matching `getStoredNotificationEvents`'s
   actual filter+sort shape exactly. The two notification indexes that
   already existed (`company_id` alone, and a partial `(user_id,
   read_at) WHERE read_at IS NULL`) serve a *different* query — the
   unread-badge count — not this one.
4. **A composite for the calendar's maintenance-block range query** —
   `company_id, status, scheduled_on`. The existing `(company_id,
   status)` index doesn't carry `scheduled_on`, so the date-range bound
   couldn't be applied inside the index scan at all before this.
5. **A composite for document search's initial fetch** —
   `document_extractions (company_id, status)`. This is the query
   `searchDocumentIdsByExtractedFields` runs before its own
   already-documented, already-deliberate in-app JSON text matching
   over `fields` (phase 04's own comment calls the 1000-row cap "a
   known scaling limit, not an oversight" — this phase doesn't revisit
   that call, just makes the filter itself indexed instead of scanning
   the company's whole extraction history first).

## What this phase deliberately didn't do

- **Did not add a GIN/full-text index on `document_extractions.fields`
  or `activity_log.metadata`** wholesale — the specific JSON keys
  actually queried (`reservation_id`/`vehicle_id`/`customer_id`) got
  targeted expression indexes instead; a blanket GIN-on-jsonb index
  would be broader, heavier to maintain on every write, and unjustified
  by any query this app actually runs today.
- **Did not touch the `outstandingBalanceMad` query** — see above;
  this needs a maintained-aggregate redesign, not an index, and that's
  a different phase's job.
- **Did not attempt to apply this migration to the live Supabase
  project** — no DB credentials capable of it exist in this
  environment (see Method above), and even if they did, applying an
  index migration to a live project is the same "not touching live
  infra unprompted" line every migration-adding phase since 03 has
  held. **Apply this migration and run `EXPLAIN ANALYZE` on the
  affected queries before/after to get the real magnitude** — that's
  the standing ask this phase adds to the pile every prior
  migration-adding phase already left.
- **Did not add `pg_trgm` indexes on `vehicles.make`/`model` or
  `contracts.contract_number`** — lower-value than the three columns
  the phase brief's own named areas actually call out; adding them
  would be scope creep dressed as thoroughness.

tsc/eslint/688 vitest tests/`next build` all clean (this phase touches
only a new SQL migration file — no application code changed, so no new
tests were needed or added).
