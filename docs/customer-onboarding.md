# Guided customer onboarding

Roadmap phase 14 — bible Chapter 6 §3 ("First-Time Customer Workflow")
and Chapter 4 §2-3 ("Camera First," "AI-Powered Document Intake"). Wires
the document intelligence engine (phases 03-04) into the actual moment
an employee meets a new customer, at `/customers/new`
(`components/domain/customers/customer-onboarding-wizard.tsx`).

## Why a wizard, not a smarter form

This app has no generic workflow engine — just a handful of shared
pieces every stepped flow (pickup, return, and now onboarding) reuses:
a local `STEPS` array, `resolveInitialStep`/`useStepFocus`
(`lib/workflow/steps.ts`, `hooks/use-step-focus.ts`), and
`WizardProgress`/`WizardFooter`. The previous `/customers/new` page was
a single-scroll plain form with no step state at all — this phase
restructures it into four steps (Identity, Driving licence, Contact,
Review) rather than bolting a camera button onto the old form, so the
bible's "scan ID → verify → scan licence → verify → contact → consent →
create" sequence reads as one continuous journey instead of a form with
an extra button somewhere in the middle.

## The chicken-and-egg problem: extracting before a customer exists

`extractDocument`/`classifyDocument`/`classifyAndExtractDocument`
(phases 03-04) all operate on an **already-uploaded `documents` row** —
they take a `documentId`, fetch the row, download its storage path, and
run a vision model over the bytes. But
`createDocumentRecord` requires a reservation, customer, or vehicle
link (`app/(dashboard)/documents/actions.ts`), and there is no customer
yet while an employee is mid-scan.

Rather than loosen that guard (every other caller of
`createDocumentRecord` correctly relies on it to prevent orphan
documents) or force an early, incomplete customer row into existence
just to hang a document off of, `lib/document-extraction.ts` gained a
parallel set of **bytes-based** functions that need no Supabase
dependency at all:

- `classifyBytes(fileBytes, mimeType)`
- `extractBytes(fileBytes, mimeType, category)`
- `classifyAndExtractBytes(fileBytes, mimeType)`

These run the exact same `generateObject` calls against the exact same
schemas as their document-row-based counterparts (both sets now share
a `resolveVisionModel()` helper extracted from the row-based
`prepareVisionCall`), but persist nothing — no `document_extractions`
row, since there's no `document_id` yet. The result lives in the
wizard's own React state until the customer is actually created, at
which point the captured `File` objects are uploaded and attached as
real documents through the completely ordinary
`uploadFile` → `createDocumentRecord` path every other upload in this
app already uses. One accepted trade-off from this: onboarding-captured
documents have no `document_extractions` history row, unlike documents
extracted through the row-based flow — re-running extraction against
them later (e.g. from the customer's document list) would call the
model a second time rather than reusing the onboarding result.

A new `extractOnboardingDocument` server action
(`app/(dashboard)/customers/actions.ts`) is the auth-gated entry point
the wizard's camera button calls — it exists purely to keep the AI
provider call behind a signed-in staff session, since nothing else
about a pre-customer scan is company-scoped data worth protecting.

## Camera-first, never camera-only

Every step's scanned fields are ordinary controlled inputs underneath.
`DocumentScanCapture` (`components/domain/customers/document-scan-capture.tsx`)
is the same dashed-pill `capture="environment"` button pattern already
used by `damage-photo-upload.tsx`/`photo-upload-grid.tsx` — there is no
`getUserMedia`/webcam precedent anywhere in this app, and no reason to
introduce one. When a scan succeeds, the extracted fields populate the
step's state directly and render through the phase-02
`DocumentConfidenceRow` component, which already auto-opens for editing
below 70% confidence — exactly the "employee spends seconds verifying
instead of minutes typing" behavior the bible asks for, reused as-is.
An employee can ignore the scan button entirely and type every field by
hand; nothing about the flow requires a photo.

**Wrong document / poor photo quality (requirement 4)**: handled two
different ways depending on where the problem is:
- A genuinely unreadable photo (blur, a caught provider exception) hits
  `extractBytes`'s existing try/catch, which returns phase 03's own
  friendly message ("We couldn't read that document automatically. Try
  a clearer photo, or enter the details by hand.") — surfaced as an
  amber notice, fields stay empty and editable.
- A *legible* photo of the *wrong* document (e.g. a licence scanned
  during the Identity step) still classifies correctly — the wizard
  compares the classified category against what that step expects and,
  on a mismatch, shows a specific notice ("This looks like a driving
  licence, not an identity document…") instead of silently mapping a
  differently-shaped `fields` object onto the wrong form fields.
- Genuinely low-confidence-but-present values (the schema's own <40
  "illegible, best guess" and <70 "blurry/uncertain" bands, per the
  extraction prompt) don't hit either path — they arrive as normal
  fields and simply auto-open for correction via `DocumentConfidenceRow`,
  which is the graceful degradation the bible actually asks for far
  more often than a hard failure.

## Duplicate detection (requirement 3)

Not re-run after every scan. It fires once, at the Review step's
submit — reusing `createCustomer`'s existing, already-tested
Merge/Keep Separate/Review Later check (phases 04/08) verbatim, moved
from the old plain form into the wizard's final step. Since nothing is
persisted until that submit, a single check there already satisfies
"interrupt before creating a duplicate record" without a second,
earlier duplicate-detection surface that could disagree with the
first. "Use them" still just navigates to the existing customer — the
scanned images captured earlier in the flow are not automatically
attached to that existing record (a known, minor limitation: the
employee can re-upload them from the customer's own page if they want
them attached).

## Optional selfie

A plain, unclassified photo capture in the Contact step — no vision
call, since a selfie doesn't need OCR and running classification on
one would just waste a model call and likely misclassify as `other`
anyway. Uploaded as a `documents` row with category `other` and a
`"Customer photo (onboarding)"` note. There's no company setting
anywhere for "require a selfie," so it's simply always optional rather
than building a setting with only one flow to control.

## Known limitations (intentional)

- **No end-to-end verification against a real photo or a real AI
  provider call** — consistent with every phase since 03: this repo's
  live Supabase project has migrations 03-14 unapplied, and spending
  real AI API credits to test wasn't judged appropriate for an
  unprompted local session. Verified instead: 29 new hand-fixture unit
  tests for the bytes-based extraction functions (mocking `generateObject`
  exactly like the existing document-extraction tests), tsc/lint/build
  clean, and a full mock-mode browser walkthrough of all four wizard
  steps including the duplicate-detection panel (using two mock
  customers that share a phone number) and step validation.
- **Phone-width verification used an iframe, not real window resize** —
  the browser automation tool's `resize_window` did not actually shrink
  the tab's viewport in this environment (`window.innerWidth` stayed at
  the full desktop size after every resize call). Injected a 390×844
  `<iframe>` into a blank tab instead, which does get its own real
  viewport for media-query purposes — confirmed `WizardProgress`
  switches to its compact mobile bar, every `sm:grid-cols-2` section
  collapses to one column, and the sticky `WizardFooter` remains fully
  usable, with no horizontal overflow.
- **Onboarding-scanned documents have no `document_extractions` row**
  (see "chicken-and-egg" above) — a deliberate consequence of running
  extraction before the customer/document exists, not an oversight.
- **The mock-mode dev server briefly, accidentally connected to the
  real Supabase project** while verifying this phase — `env -u
  NEXT_PUBLIC_SUPABASE_URL` unsets a shell variable, but Next.js's
  `.env.local` loading only skips a variable that's *already present*
  in `process.env`; unsetting isn't the same as overriding, so
  `.env.local`'s real values filled the gap straight back in. The one
  request that reached Postgres failed atomically on an unrelated
  schema error before any row was written. The correct way to force
  true mock mode for a `next dev` process is setting the two
  `NEXT_PUBLIC_SUPABASE_*` variables to an **empty string**, not
  unsetting them — worth remembering for every future phase's
  verification pass, not just this one.
