# Dynamic Contract Engine: templates & variable mapping

Roadmap phase 10 — bible Chapter 8, sections 1-7 ("A contract should
not be a document someone fills out. It should be the final result of
an intelligent workflow."). Genuinely new ground: no `contract_template`
concept, PDF generation, or contract data model existed anywhere in
this codebase before this phase. Phase 11 covers the rest of the
chapter (signatures, lifecycle states, amendments, printing, audit) —
this phase ends at "a reviewed, saved template can generate a filled,
correctly-branded contract document from real business data."

## The pieces

Pure, no Supabase dependency (`lib/contracts/`):
- `variables.ts` — the fixed catalog of real, resolvable business
  fields (`customer.fullName`, `vehicle.plate`, `pricing.totalMad`,
  `flags.youngDriver`, …). Closed by design: every entry has a real
  data source, so a proposed mapping or a condition can never
  reference something that silently renders blank.
- `template-engine.ts` — variable substitution (`{{field.path}}`
  tokens) and the condition model (`equals` / `exists` on one field —
  deliberately not a rules DSL, per the phase brief's own instruction
  not to over-engineer requirement 4).
- `context.ts` — turns real customer/vehicle/reservation/deposit/
  company rows into the flat context the engine reads, including
  three precomputed condition flags backed by real data.

Database-facing (also `lib/contracts/`):
- `pdf-extract.ts` — PDF text extraction (`pdf-parse`), the phase
  brief's own "safer starting point" over Word parsing.
- `template-ai.ts` — the first AI service call for this domain
  (`askAI`, purpose `contract.propose_template_mapping`): proposes
  sections and a variable mapping from extracted text.
- `pdf-render.ts` — renders a generated contract to real PDF bytes
  (`pdf-lib`, no native binaries/Chromium).
- `template-store.ts` — orchestrates all of the above against real
  tables: propose-from-upload, activate, edit-as-new-version, generate.

## Template versioning (requirement 6)

Three tables: `contract_templates` (one row per named template),
`contract_template_versions` (every edit is a new row — `sections`/
`variable_mappings` on an existing version are never mutated once
inserted), `contracts` (a generated contract, pinning
`template_version_id` forever).

**One uniform rule regardless of where a version came from**: every
version starts `pending_review`; only an explicit `activateVersion`
call (archiving whichever version was previously active) makes it the
one `generateContract` will use. This applies equally to a fresh AI
proposal from upload and to a manual owner edit
(`createEditedVersion`) — one mental model, not two. The cost is a
small extra click for a manual edit that a human clearly already
"reviewed" by writing it; the benefit is a version that's still
`pending_review` is genuinely safe to keep iterating on before it's
ever load-bearing. `lib/contracts/__tests__/template-store.test.ts`
directly tests the acceptance criterion this exists for: after
activating v1, editing, and activating v2, v1's row is still present,
still `archived` (never deleted), and its `sections` are byte-for-byte
the original content — a contract generated from v1 keeps pointing at
real, unchanged data forever.

## Owner review (requirement 2)

Nothing an AI proposes is ever usable to generate a contract until a
human calls `activateVersion` — there's no path from "AI produced
this" straight to "live," by construction (a `pending_review` version
simply isn't returned by `generateContract`'s active-version lookup).
The review page (`/contract-templates/[id]/versions/[versionId]`) is
a full editor, not a read-only preview: sections, variable mappings,
and a per-section condition (field, operator, value) are all editable
before confirming.

## AI-proposed mapping (requirement 1)

`template-ai.ts` asks the model to (a) break the extracted text into
titled sections with `{{field.path}}` substitutions, restricted to the
fixed catalog, and (b) list every placeholder it found and its
proposed field. Two deliberate restraints:
- The model is told never to invent a field path outside the catalog
  — and it's checked anyway: `template-store.ts` filters the response
  through `isKnownContractField`, never trusts the model's word alone
  (same "verify, don't just trust" discipline as every other AI
  feature in this codebase).
- The model only flags a section as `looksConditional` — it does NOT
  propose the actual condition (operator/value). "This reads like a
  young-driver clause" and "trigger this when `flags.youngDriver`
  equals `true`" are different claims of confidence; only the first is
  something a text-reading model can really support. The owner
  configures the real condition during review — flagged sections are
  named in `ai_notes` so nothing gets missed.

## Conditional content (requirement 4)

The bible's own two named examples are "additional insurance
selected" and "young driver." **Only one has real data behind it**:
no "additional insurance" concept exists anywhere in this schema (no
field, no add-ons table) — not offered as a condition, not faked.
"Young driver" is computed from `customers.date_of_birth` (age < 25 at
pickup, with an exact boundary test — turning 25 on the pickup day
itself is correctly "not young" anymore). Two more realistic
conditions were added since real data exists for them: `deposit
collected` and `discount applied`. All three are ordinary catalog
entries (`flags.*`) — the condition editor and the variable-mapping
editor share one dropdown, not two separate concepts.

## Multi-language & branding (requirement 5)

`contract_templates.language` exists and is required on every
template (defaulting `fr`) — structurally real, even though only one
language is actually implemented: nothing translates prompts, UI
copy, or generated contract text based on it yet. Templates in
different languages are simply different `contract_templates` rows an
owner uploads separately.

Branding reuses the `companies` table's existing fields (name,
address, city, country, tax ID, business register) rather than adding
new, unconfigurable settings — there's no settings UI in this phase to
manage a logo or brand colour, so adding columns nobody could set
would just be a second, permanently-empty field the way
`customer_intelligence`'s absent factors were avoided in phase 08. The
generated PDF's small print (a legal footer) lives on the *template*
version instead, entered during the same review step that's already
being built — reusing an existing screen instead of inventing a
settings sub-page for one text field.

## Contracts are data, not files (requirement 3)

A generated contract (`contracts` table) stores `resolved_context`
(every variable's actual resolved value) and `rendered_sections`
(the final section text after substitution and condition filtering)
as a permanent snapshot — even if the customer, vehicle, or
reservation rows are edited afterward, a previously generated
contract's displayed content never silently changes. The PDF
(`pdf_storage_path`) is produced from that same snapshot via
`renderContractPdf`, which is pure with respect to its inputs: same
branding + sections in, same bytes out, every time — the concrete
proof that the PDF really is "a regeneratable rendering... not the
source of truth," not just a documentation claim.

**The generated PDF's layout is deliberately simple, not a clone of
the uploaded original.** A clean single-column A4 document (company
header, section titles, section bodies, legal footer) — reproducing
the original template's actual visual layout (columns, letterhead
positioning, custom fonts) would need real document-layout
preservation, well beyond what a text-extraction pipeline can support.
The uploaded original's job is supplying section text and letting the
AI identify variables, not being pixel-cloned.

## Known limitations (intentional)

- **PDF-only templates.** The phase brief's own guidance ("PDF text
  extraction is the safer starting point") — Word document parsing is
  not implemented. A scanned, image-only PDF with no text layer fails
  cleanly (`extractPdfText` returns `ok: false`) rather than silently
  producing an empty template.
- **This whole domain is live-Supabase-only**, same as every mutation
  since phase 04 — `template-store.ts` calls `createClient()`
  unconditionally, so nothing here can be exercised end-to-end without
  a real project. Unlike a plain mutation gap though, the four
  *read-only* pages (`/contract-templates`, `/contract-templates/[id]`,
  the version review page, `/contracts/[id]`) explicitly guard with
  `isSupabaseConfigured` + try/catch and degrade to an empty
  list/`notFound()` in mock mode, matching the
  `loadVehicleIntelligence`/`loadCustomerIntelligence` convention —
  verified live in the browser, light and dark: the nav item, empty
  state, and upload form all render correctly with zero console
  errors; clicking "Generate contract" reproduces the same
  "Supabase is not configured" dev-mode error every other mutation in
  this app already produces in mock mode (`createCustomer`,
  `createDocumentRecord`, etc.) — not a regression this phase
  introduced.
- **The `contract_engine` migration hasn't been applied to the live
  Supabase project** — same recurring situation as every table added
  since phase 03 (no Docker/Supabase CLI available locally). The
  AI-proposal pipeline, `activateVersion`/`createEditedVersion`'s
  version-immutability behavior, and `generateContract`'s data
  resolution were **not** exercised against real Postgres for this
  reason — verified instead via `lib/contracts/__tests__/*` (hand-
  computed pure-function fixtures for the engine/context math, plus a
  purpose-built in-memory fake Supabase client for the store
  functions, since several of them issue multiple different sequential
  operations against the same table within one call — a detail the
  canned-per-table-response pattern other store tests use can't
  represent).
- **No contract list/search page** — a generated contract is reached
  only from the reservation it belongs to (`/reservations/[id]`'s
  Contract card) or a direct `/contracts/[id]` link. A company-wide
  "all contracts" view is reasonable future scope, not required by
  this phase's acceptance criteria.
- **Template management is owner/manager only**; generating a contract
  for an existing reservation is available to the same front-desk role
  set as completing a rental (owner/manager/agent).
