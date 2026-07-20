# Documents & the extraction pipeline

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
- **No automatic classification.** `extractDocument` trusts the
  document's own stored `category` (or an explicit override) — it does
  not look at the image and guess what kind of document it is. That's
  phase 04.
- **No expiry monitoring.** Dates are extracted and normalized to ISO
  8601, but nothing watches them for upcoming expiry yet — also phase
  04.
- **Not wired into any real workflow.** The only caller today is the
  internal `/dev/document-extraction` test page. Phases 10 and 14 are
  where this becomes part of an actual product flow (contract template
  variable mapping; camera-first customer onboarding).
- **Extraction is synchronous, on the request.** There's no background
  job infrastructure anywhere in this codebase yet (no queue, no cron,
  no Edge Functions) — a `generateObject` call of a few seconds runs
  inline in the server action, the same way the one existing longer-
  running request (`app/api/ai-assistant/chat/route.ts`) does. Fine for
  an internal test page; a real product surface calling this on every
  upload would want to reconsider this.
