# CSV Importer (Vehicles / Customers)

Roadmap phase 48, second phase of Wave 7 ("Switching, Setup, and
Customer Acquisition Readiness"), directly following phase 47's Company
Setup Wizard. Brief: "an existing agency does not need to retype its
business into RentalOS." First supports vehicles and customers, with
column matching, a preview, duplicate detection, an error report, and
a safe-import/undo strategy.

`/import` (owner/manager only — `app/(dashboard)/import/page.tsx`),
wired into `moreLinks` in `lib/navigation.ts`.

## CSV only, no XLSX, deliberately

No spreadsheet-parsing library existed anywhere in this codebase
before this phase, and the well-known npm packages for real binary
`.xlsx` parsing have carried security advisories (prototype pollution,
regex DoS) at various points. Rather than add that dependency and its
review burden, this phase parses CSV only — a new `parseCsv()` added
to `lib/csv.ts` alongside its existing `toCsv()` writer, same
dependency-free ethos, handling quoted fields (embedded commas/quotes/
newlines), both CRLF and bare LF, and a leading BOM (since `toCsv`
always writes one — a re-imported export must tolerate it). Every
mainstream spreadsheet tool (Excel, Google Sheets, Numbers) exports to
CSV trivially, so this is a real but narrow gap, stated plainly in the
wizard's own copy ("a real Excel (.xlsx) file needs exporting to CSV
first") rather than silently only half-working on a `.xlsx` upload.

## No Storage upload — parsed entirely client-side

Every other file-handling feature in this app (documents, logos,
contract templates) uploads to Supabase Storage first, then writes a
DB record referencing it — a two-step flow `docs/failure-registry.md`
already flags as having no orphan/retry handling. This phase sidesteps
that entirely: the CSV is read via the browser's own `File.text()` and
parsed/matched/validated in the client (`components/domain/import/
import-wizard.tsx`), using the exact same pure functions
(`lib/import/*`) a unit test exercises directly. Nothing is persisted
until the user reaches Review and clicks Import — no raw file is ever
stored, and there's no `ACCEPTED_IMPORT_MIME_TYPES` constant or new
`documents.category` needed, since the file itself never reaches the
server at all. The only server round-trips are the two read-only
dedup-pool fetches and the final commit.

## Column matching

`lib/import/column-matching.ts` defines each entity's target fields
(label, required flag, alias list) and `suggestColumnMapping()`, which
normalizes headers (lowercase, punctuation collapsed to spaces) and
matches them against each field's label/aliases — never assigning one
header to two fields. Aliases deliberately include this app's own CSV
export headers (`app/api/exports/fleet/route.ts`,
`app/api/exports/customers/route.ts`), so re-importing an export of
this app's own data auto-maps every column with zero manual work,
confirmed directly in `lib/import/__tests__/column-matching.test.ts`.
The user can still override any suggested mapping before continuing.

## Row validation and duplicate detection

`lib/import/vehicle-import.ts` and `lib/import/customer-import.ts` are
pure, no-Supabase-dependency validators — the same required
fields/enum universes as the manual single-record create actions
(`app/(dashboard)/fleet/actions.ts`, `app/(dashboard)/customers/
actions.ts`), so an imported row is held to the same rules as one
typed in by hand. `lib/import/shared.ts` holds the parsing helpers both
share (flexible date parsing, loose number parsing tolerant of
thousands separators, case-insensitive enum matching).

**Vehicles** dedup on the DB's own natural key: `vehicles` has a hard
`unique(company_id, registration_number)` constraint, so a plate
collision is a certain duplicate, not a scored one. `normalizeIdLike`
(originally written for customer licence/ID-document matching in
`lib/customer-matching.ts`) is reused here for the exact same reason
it's reused there — "MA 204471" and "ma-204471" should compare equal.

**Customers** have no DB-level uniqueness, so duplicate detection
reuses `lib/customer-matching.ts#findDuplicateMatches` — the identical
scored matcher (and identical `isLikelyDuplicate` bar) the manual
create-customer form already uses. Both validators additionally check
every row against every *earlier* row in the same file, not just
against what's already in the database — a growing in-memory pool fed
one accepted row at a time, so three rows in one file all describing
the same person get flagged against each other too. An invalid row
never joins that pool: bad data shouldn't poison detection for a
later, otherwise-clean row.

Every validator, plus the CSV parser and column matcher, has direct
unit test coverage (`lib/import/__tests__/`, `lib/__tests__/csv.test.ts`)
— 45 new tests total. Writing the vehicle date tests caught a real
timezone bug in `parseFlexibleDate`: reformatting a parsed `Date` via
`toISOString()` reinterprets a plain local date in UTC and can shift
it a day in either direction depending on the runner's own UTC offset;
fixed to read the `Date`'s own local calendar components back out
instead.

## Duplicate handling: skip by default, one override checkbox

A flagged row is never silently dropped or silently imported — the
Review step shows every row's status (Ready / Duplicate / Error) with
its own reason, and a single "Import the N flagged duplicates anyway"
checkbox controls whether flagged rows join the commit, mirroring the
manual create-customer form's own `acknowledgeDuplicates` flag rather
than inventing a new mechanism. There is no per-row override — the
whole batch's duplicates are either all skipped or all included. Error
rows can never be imported regardless of that checkbox; a downloadable
CSV error report (built with this file's own `toCsv()`, entirely
client-side) lists every failed row and its reason.

## The commit: new territory for this codebase

No `.insert([...])` array-insert call exists anywhere else in this
app — every prior mutation inserts one row at a time. Rather than
introduce a batch-insert (and its own atomicity questions — does one
bad row roll back the other 49?), `commitVehicleImport`/
`commitCustomerImport` (`app/(dashboard)/import/actions.ts`) insert one
row at a time in a loop, exactly the idiom `lib/operations-feed/run.ts`
already established for batch jobs elsewhere in this codebase ("bulk
fetch once, then loop single-row writes"). One row's own DB-level
failure (e.g. a plate that collided with a second import landing
between preview and commit) is caught and reported per-row, never
aborting the rest of an otherwise-good file — the literal "safe import
strategy" the phase brief asks for.

`IMPORT_ROLES = ["owner", "manager"]`, deliberately tighter than either
entity's own single-record create role (customers allow `agent`
too) — a bulk import is a materially higher-blast-radius action than
adding one record by hand.

One `activity_log` event is recorded per commit
(`vehicles_imported`/`customers_imported`, new `ActivityType` values;
`import_batch`, a new `EntityType`, since the event's `entity_id` is
the `import_batches` row's own id, not a vehicle/customer row) — never
one event per imported row, which would flood the activity feed on a
200-row import.

## Undo: a new `import_batches` table, best-effort by row

`supabase/migrations/20260813090000_phase48_import_batches.sql` adds
`import_batches` (one row per commit) and a nullable
`import_batch_id` on both `vehicles` and `customers`. This is the
importer's first-ever "safe import" mechanism in this codebase — no
undo/rollback pattern existed anywhere before this phase.

`undoImportBatch` deletes every row tagged with a batch **one at a
time**, not a single bulk `delete().eq(...)` statement — a Postgres
statement is all-or-nothing, so one row that's since become referenced
elsewhere (an imported vehicle now has a reservation, an imported
customer now has one too) would otherwise block removing every other
row in the same batch. `import_batches.undone_at` is only set once the
batch is **fully** empty; a partially-blocked undo simply leaves
`undone_at` null so the batch keeps showing in "Recent imports" and can
be retried later (e.g. once that reservation is cancelled), rather than
being permanently stuck half-done. `getImportBatches` (`lib/data.ts`)
lists the last 10 not-yet-fully-undone batches per company for that
section; mock mode returns an empty list rather than modeling fake
batches, since a fresh install has genuinely imported nothing.

## Deliberately not done (this phase's own scope boundary)

- **XLSX binary support** — see "CSV only" above.
- **Existing active reservations / historical rentals** — the phase
  brief names these as explicit follow-on work ("Then: existing active
  reservations if safe. Historical rentals where useful."), not this
  phase's own deliverable. Importing a reservation needs to resolve a
  customer and a vehicle reference per row (by phone/plate lookup, or
  create-on-the-fly), which is a meaningfully different, larger problem
  than the flat single-entity rows this phase handles — left for a
  future phase.
- **Branch assignment on import** — an imported vehicle always lands
  with `branch_id: null` (unassigned). Matching a "Branch name" column
  to a real branch reliably (fuzzy name matching, or creating branches
  on the fly) was judged out of proportion for this phase; the existing
  Fleet edit page already lets an owner assign a branch afterward.
- **Per-row duplicate override** — see "Duplicate handling" above; the
  checkbox is all-or-nothing for the batch, not per-row.

## Verification

Every read path — CSV parsing, column matching, the dedup-pool fetches
(`getVehicleDedupPool`/`getCustomerDedupPool`), and the full
preview/duplicate-detection pipeline — was live-verified in mock mode
(`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev`),
in both light and dark themes, against real mock fixture data: a test
vehicle CSV correctly flagged a plate matching an existing mock
vehicle as a duplicate and a row missing required fields as an error;
a test customer CSV correctly flagged both an existing-pool duplicate
(fuzzy match against a real mock customer) and an intra-file duplicate
cluster (two rows describing the same person). The duplicate-override
checkbox and error-report download were both exercised directly.

**Not reachable live, the same recurring gap every mutation-touching
phase since 03 has carried**: the actual commit (`commitVehicleImport`/
`commitCustomerImport`) and `undoImportBatch` both call `createClient()`
unconditionally and throw "Supabase is not configured" in mock mode —
confirmed directly by clicking "Import 2 rows" and observing the
error surface cleanly inline via the wizard's own `useSubmitGuard`
error state (not a crash, not the `app/(dashboard)/error.tsx`
boundary — the promise rejection is caught by the hook itself). The
insert-loop's own partial-success behavior and `undoImportBatch`'s
per-row FK-failure handling are reviewed by hand, not exercised
end-to-end, and need a human with a real Supabase project to confirm.

tsc/eslint/vitest (749 tests) and a full production build were clean
at every checkpoint.
