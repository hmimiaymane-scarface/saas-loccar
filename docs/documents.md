# Documents, extraction & intelligence

## Upload flow

Documents are uploaded directly from the browser to Supabase Storage,
not proxied through a server action. `new-document-form.tsx` and
`document-upload-row.tsx` call `validateFile()` and `buildStoragePath()`
(`lib/storage.ts`), then `uploadFile()` (`lib/storage-client.ts`) writes
the bytes straight to the private `company-files` bucket under the
signed-in user's own session — Storage RLS is what enforces per-company
access here, exactly as if it were a table. Only *after* that succeeds
does the client call `createDocumentRecord()`
(`app/(dashboard)/documents/actions.ts`) to write the metadata row.
Nothing about this flow changes for the extraction pipeline described
below — extraction reads the same uploaded file, after the fact.

Every document belongs to one of nine categories
(`types/rental.ts#DocumentCategory`, `lib/documents.ts#CATEGORY_OPTIONS`):
`rental_contract`, `identity_document`, `driving_licence`,
`proof_of_address`, `insurance_document`, `vehicle_registration`,
`technical_inspection`, `payment_receipt`, `other`. There is no separate
"passport" category — a passport is uploaded as `identity_document`,
same as a national ID.

## The extraction pipeline

`lib/document-extraction.ts#extractDocument(supabase, companyId,
documentId, options?)` runs a vision-capable model over an
already-uploaded document and returns per-field values with a
confidence score each. It is a standalone service, not wired into the
upload flow above — nothing extracts automatically today. It exists to
be called explicitly, currently only from the internal test page at
`/dev/document-extraction` (not linked from navigation); phases 04, 10,
and 14 of the build roadmap are the real, product-facing callers.

Four of the nine document categories have an extraction schema —
`identity_document`, `driving_licence`, `vehicle_registration`,
`insurance_document`. The other five (`rental_contract`,
`proof_of_address`, `technical_inspection`, `payment_receipt`, `other`)
are rejected before the model is ever called
(`schemaForCategory()` returns `null`) — this is a deliberate cost
control, not an oversight; there's no schema to extract into for those
categories yet.

The model used is whichever AI provider is already configured for the
AI Assistant feature — `resolveAvailableProvider()`
(`lib/ai/models.ts`) prefers Anthropic, falls back to OpenAI, and
returns `provider_not_configured` if neither `ANTHROPIC_API_KEY` nor
`OPENAI_API_KEY` is set. **No new environment variables are needed for
this feature** — it reuses the exact same keys the chat assistant
already requires.

Every extraction attempt — success or failure — is persisted as a new
row in `document_extractions`
(`supabase/migrations/20260724090000_document_extractions.sql`), never
updated in place. Re-running extraction on the same document creates a
second row rather than overwriting the first, the same append-only
philosophy as `activity_log` (see `docs/security.md` and the phase-01
event backbone) — a bad extraction never silently erases a good one,
and failed attempts stay visible for debugging instead of being
discarded.

## Confidence scores are model-reported, not statistical

The confidence number on each field is the vision model's own stated
certainty, produced from a prompt asking it to rate 95-100 only when
text is completely clear and below 70 when blurry, obscured, or
guessed. It is not a calibrated statistical measure the way a
traditional OCR engine's character-level confidence would be — treat it
as a strong signal for "should a human glance at this field before
trusting it," which is exactly what
`components/domain/intelligence/document-confidence-row.tsx` (phase 02)
and `lib/tone.ts#confidenceTier()`'s 90/70 thresholds do with it, not as
a number with a precise statistical meaning.

## Automatic classification (phase 04)

`lib/document-extraction.ts#classifyDocument(supabase, companyId,
documentId)` runs a second, lighter vision call — "what kind of
document is this" rather than "read every field" — across all nine
`DocumentCategory` values, not just the four with an extraction schema.
`classifyAndExtractDocument(...)` is the combined flow real callers
want: classify, persist the detected category onto the row, then (only
for the four supported categories) run `extractDocument` with it.
`extractDocument` and `classifyDocument` share a `prepareVisionCall`
helper for the fetch/mime-check/provider-check/download/model-resolve
steps they both need.

Not wired into the real upload flow (`new-document-form.tsx` still asks
the uploader to pick a category) — that's phase 14's job, per the phase
04 brief's own non-goals. Demoed end-to-end at
`/dev/document-extraction`'s "Classify + Extract" button.

## Document relationships & versioning (phase 04)

Every document has linked to a reservation, customer, and/or vehicle
since the original schema (`documents_*_id` columns, a check constraint
requiring at least one) — there was nothing to add here.

What phase 04 added is version chaining:
`documents.replaces_document_id` (a self-referencing FK) and reusing
the `status = 'replaced'` value the original check constraint already
allowed but nothing ever set. `createDocumentRecord`
(`app/(dashboard)/documents/actions.ts`) now calls
`lib/documents.ts#findSupersededDocument` before inserting — if the
same entity already has an active document of the same category, the
new upload supersedes it (new row gets `replaces_document_id`, old row
flips to `status: 'replaced'`) instead of leaving two "active" rows for
the same thing. Old versions are never deleted, only superseded — same
append-only-history principle as the phase 01 event backbone.
`getDocumentVersionHistory(...)` returns the full chain, newest first,
for a given entity+category.

## Expiry monitoring (phase 04)

`documents.expires_on` (a plain queryable date, mirroring
`vehicles.insurance_expires_on` and `customers.license_expires_on`) is
what `lib/documents.ts#getExpiringDocuments(supabase, companyId, days)`
scans — "documents expiring in the next N days for this tenant,"
including already-expired ones (same "overdue counts as due" convention
as `lib/alerts.ts#isWithinWarningWindow`). This is deliberately a
separate mechanism from the existing `vehicle_document_expiring` /
`licence_expiring` live alerts in `lib/data.ts#getLiveAlerts` (which
read `vehicles`/`customers` columns directly) — it's what phase 12's AI
Operations Feed will consume instead, at the document-upload
granularity rather than the entity level.

Nothing populates `expires_on` from the manual upload form (out of
scope for this phase, see non-goals). `lib/documents.ts#recordDetectedExpiry(...)`
is the intended writer — call it after `classifyAndExtractDocument`
detects an `expiryDate` field, and it both updates the column and emits
a `document_uploaded` event (`actorType: "ai"`) carrying `expires_on` in
its metadata, per requirement 4. Delivery (actually notifying anyone) is
phase 18's job — this phase only builds the detection query and the
event emission.

## Duplicate customer detection (phase 04)

`lib/customer-matching.ts` is a pure scoring engine (no Supabase
dependency): exact matches on normalized id-document/licence number are
a strong independent signal (55 points each), and fuzzy name similarity
(Levenshtein-based) only contributes above an 0.85 similarity floor,
capped so a shared name alone can reach the "surface for review"
threshold (40) but never "likely duplicate" (70) on its own — a common
name coincidence shouldn't read as a confident duplicate.

`lib/data.ts#findDuplicateCandidates(companyId, candidate,
excludeCustomerId?)` is the DB-facing wrapper, following the same
`isMockMode()` convention as `findCustomerByPhone` right above it.
`createCustomer` (`app/(dashboard)/customers/actions.ts`) runs this
alongside the existing exact-phone check — but unlike that check, a
likely duplicate doesn't block creation. The form shows scored
candidates with a "Use them" link per candidate and a "Not a duplicate —
create anyway" button that resubmits with `acknowledgeDuplicates=true`
to skip the check — the bible's Merge / Keep Separate / Review Later
flow, kept minimal per the phase's non-goals (no real merge UI).

**Known scaling limit**: `findDuplicateCandidates` scores against up to
500 customers per company, fetched in one query — fine at this
product's current scale, not indexed/paginated for a company with
thousands of customers.

## Cross-document consistency checks (phase 04)

`lib/document-consistency.ts#getConsistencyIssuesForCustomer(supabase,
companyId, customerId)` takes every active document a customer has,
reduces each to its latest completed extraction, and flags any
disagreement in `fullName` or `birthDate` across them (e.g. a passport
and a driving licence with differently-spelled names) as a review item
— any normalized inequality counts, not a fuzzy-similarity threshold
the way duplicate-customer matching is, since a mismatch on a single
customer's own documents is inherently suspicious even for a near-miss.
Pure logic (`findNameMismatches`/`findBirthDateMismatches`) is separated
from the DB fetch for unit testing.

## Search by extracted field (phase 04)

`getDocumentsList`'s search (`lib/data.ts`) now matches, in live mode,
in addition to filename: the linked customer's name, the linked
vehicle's plate/make/model, and any extracted field value (licence
number, VIN, ...) via `lib/documents.ts#searchDocumentIdsByExtractedFields`.
JS-side substring matching over a bounded batch of extractions (capped
at 1000, newest first) rather than a database-side JSONB text search —
same "no new infra for a modest-scale problem" call as the rest of this
pipeline. Mock mode search stays filename-only; there are no extraction
fixtures to search against there.

## Per-table access

`document_extractions` follows the same "coarse RLS + fine action-layer
check" pattern as every other table documented in `docs/security.md`:
any company member can `select`; `insert` requires
`owner`/`manager`/`agent` (mirroring `documents` itself) plus a
same-company re-check on the referenced `document_id`. There is no
`update` or `delete` policy for anyone — append-only by design.

## Known limitations (intentional, for a future phase)

- **Only JPEG/PNG/WEBP images are supported.** PDF and HEIC are
  accepted for upload elsewhere in the app but rejected here
  (`unsupported_file_type`) — Claude and GPT-4o handle direct PDF input
  inconsistently across providers, and HEIC support varies too. Getting
  either right reliably is separable work, not done in this pass.
- **Not wired into any real workflow.** The only callers today are the
  internal `/dev/document-extraction` test page and (for versioning)
  `createDocumentRecord`. Automatic classification isn't triggered from
  the real upload form, expiry isn't populated from a real upload, and
  duplicate/consistency checks aren't surfaced anywhere but the dev page
  and the customer-creation form. Phases 10 and 14 are where the rest of
  this becomes part of an actual product flow (contract template
  variable mapping; camera-first customer onboarding).
- **The phase 04 migrations haven't been applied to the live Supabase
  project.** Same situation as phase 03's `document_extractions`
  table — this repo's live project (`.env.local`) has never had
  `20260725090000_document_versioning_and_expiry.sql` or
  `20260725090100_customer_duplicate_lookup_indexes.sql` run against it.
  `documents.expires_on`/`replaces_document_id` don't exist there yet,
  so anything touching them (`getExpiringDocuments`,
  `findSupersededDocument`, the "Expiring documents" and "Cross-document
  consistency" panels on the dev page) will error against that project
  until the migration is applied — verified instead via unit tests
  (mocked Supabase client) and a mock-mode browser pass.
- **Extraction is synchronous, on the request.** There's no background
  job infrastructure anywhere in this codebase yet (no queue, no cron,
  no Edge Functions) — a `generateObject` call of a few seconds runs
  inline in the server action, the same way the one existing longer-
  running request (`app/api/ai-assistant/chat/route.ts`) does. Fine for
  an internal test page; a real product surface calling this on every
  upload would want to reconsider this.
