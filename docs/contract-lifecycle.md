# Contract lifecycle, signatures & amendments

Roadmap phase 11 — bible Chapter 8 §9-20. Continues phase 10's
template/generation engine (`docs/contracts.md`) with everything that
happens to a contract after it exists: preview and validation before
it's created, a real state machine after, signatures, amendments, and
a full audit trail.

## The pieces

- `lib/contracts/lifecycle.ts` — the pure state machine (mirrors
  `lib/reservations/status.ts` exactly): `CONTRACT_STATUS_TRANSITIONS`,
  `hasRequiredSignatures`, label helpers.
- `lib/contracts/validation.ts` — pure, requirement 2's five blocking
  checks.
- `lib/contracts/preview-ai.ts` — the advisory layer (requirement 8).
- `lib/contracts/template-store.ts` — extended with `previewContract`,
  the lifecycle transition functions, signatures, amendments, search,
  and PDF regeneration.
- New tables: `contracts.status`/`contract_number`, `contract_signatures`,
  `contract_amendments`.

## Lifecycle: state over flags (requirement 3)

```
draft → prepared → awaiting_signature → signed → active → completed → archived
  ↓         ↓              ↓               ↓
  └─────────┴──────────────┴───────────────┴──→ cancelled
```

One status column, one transition table, enforced in exactly one
place (`transitionContract` in `template-store.ts` — every lifecycle
function funnels through it, so an illegal jump can't slip in through
a new call site later). Every transition emits the matching
`contract_*` event via phase 01's event backbone.

**`signed` is never a manually-clicked transition.** It's the one
exception to "state over flags, driven by buttons": it happens as a
side effect of `addContractSignature`, automatically, the moment both
required signer types are on file (`hasRequiredSignatures`). The UI's
`ContractLifecycleActions` filters it out of the button list on
purpose (`isManualTransition`) — offering a "mark as signed" button
that bypasses actually checking for real signatures would defeat the
entire point of having a signature requirement at all.

`active`/`completed`/`archived` have no path back to `cancelled` —
once the underlying rental is genuinely active, cancelling the
*contract* doesn't undo that; an active rental's own lifecycle
(`lib/reservations/status.ts`) is what actually governs that, not this
field.

## Validation: block generation with a specific error (requirement 2)

`generateContract` runs `validateContractGeneration` *before* writing
anything — on a blocking error, nothing is persisted, not even a
`draft` row. The five checks:

1. **Customer identity valid** — reuses phase 09's
   `assessReturningCustomerReadiness` (licence + identity document
   expiry), but treats it as a **blocking error** here, not advisory.
   This is a deliberate, real difference from phase 09's own usage of
   the identical signal: skipping a few clicks in the reservation
   form is low stakes; generating an actual legal document for a
   customer with an expired ID is not. Same underlying data, two
   different appropriate policies for two different moments.
2. **Vehicle assigned** — a contract needs a specific vehicle; an
   unassigned reservation can't generate one.
3. **Pricing/dates sane** — non-negative rate, positive total, at
   least one day, return after pickup.
4. **Mandatory clauses present** — the template's unconditional
   sections (`condition: null`) are, by construction, the "always
   required" ones; zero rendered sections after condition-filtering
   means the template produced nothing at all, which is always wrong.
5. **No missing variables** — any section whose body still contains a
   literal `{{` after substitution (an unresolved placeholder) blocks
   generation, naming the specific section.

`previewContract` runs the *exact same* validation (both call a
shared `resolveContractInputs`), so what the owner sees on the preview
page and what actually gates generation can never silently disagree.

## Preview (requirement 1)

`/reservations/[id]/contract-preview` — read-only, nothing persisted.
Categorizes what the bible asks for:
- **Auto-generated info**: the resolved context, grouped by the same
  catalog groups `lib/contracts/variables.ts` already defines.
- **Legal text**: the rendered sections exactly as they'll appear on
  the PDF.
- **Missing data**: validation errors — these disable the Generate
  button outright.
- **Warnings**: validation warnings (currently none of the five checks
  produce one — they're all treated as hard errors) plus the AI's
  advisory findings, shown together but visually distinct from the
  "missing data" block so it's never ambiguous which kind of finding
  is which.

There is no "editable info" on this page in the sense of inline
editing — every value here was already fixed when the reservation was
created (dates, pricing, vehicle). "Editable" per the bible's own list
is satisfied by *where* it's editable: the reservation itself, before
returning to regenerate the preview — not a second, parallel editing
surface on top of already-committed reservation data.

## AI assistance is advisory, never authoritative (requirement 8)

`flagContractPreviewIssues` is a second, independent signal from
validation, always rendered in its own section, never merged into the
"missing data" list. It can flag things validation structurally can't
(unusual pricing, contradictory clause wording) but it can also be
wrong or say nothing — an empty warnings list is treated as a normal,
good result, not silently padded with something to say.

## Signatures: the mechanism, stated plainly (requirement 4)

**This is a typed full name plus an explicit confirmation checkbox —
not a drawn signature, not a certified e-signature, not a biometric or
cryptographic proof of identity.** The phase brief explicitly permits
this simpler mechanism when a full e-signature library is out of
scope, and asks for the choice to be stated clearly since it carries
legal weight. Stated here as plainly as possible: what's recorded is
*a claim*, made by whoever had access to fill in the form at that
moment, that a specific named person agreed to the contract — the same
evidentiary weight as a typed name at the bottom of an email, not a
notarized signature. `device_info` (user agent) and `ip_address` are
captured to make that claim more attributable, not to make it
cryptographically binding.

Two signer types are required (`customer`, `employee`); `manager` and
`additional_driver` are optional add-ons. The moment both required
types are on file, the contract automatically becomes `signed` — see
the lifecycle section above.

## Amendments never touch the original (requirement 5)

`createContractAmendment` only ever `INSERT`s into `contract_amendments`
— there is no `.update()` on `contracts` anywhere in that function, or
anywhere in this phase's code at all after generation. Verified with a
real test, not just a design claim:
`lib/contracts/__tests__/template-store.test.ts`'s amendment test does
a full JSON deep-equality check of the contract row before and after
creating an amendment.

**No amendment automatically regenerates an amended contract
document.** An amendment is a structured record (type, description, a
simple before/after field diff) displayed alongside the original — it
does not produce its own PDF or re-run the template engine with
modified inputs. Building that would mean re-running the entire
generation pipeline against synthetic "what-if" data, which is real
scope beyond "record that this happened, linked to the original,
without altering it." A future phase could add amendment-aware
regeneration; this one deliberately doesn't.

## PDF: fast, consistent, versioned, immutable, with real metadata (requirement 6)

Reused phase 10's `pdf-lib`-based renderer unchanged (already
"fast, consistent, versioned, immutable" — no new PDF library added,
checked `package.json` first as the brief asks). This phase adds the
other half: the PDF's own document metadata (Title/Subject/Keywords)
now embeds the contract's id and human-readable number, so the file
itself carries a durable link back to its database row even outside
this app. `regenerateContractPdf` makes "the PDF is a regeneratable
rendering" a real, callable capability rather than just a comment: it
rebuilds byte-for-byte from the contract's stored
`resolved_context`/`rendered_sections` alone, never re-reading the
customer/vehicle/reservation rows — so it can't drift even if those
have since changed.

## Search (requirement 7)

`searchContracts` extends the exact resolve-ids-then-filter pattern
`getDocumentsList` established in phase 04 (requirement 7's own
instruction: extend what exists, don't build a parallel system) —
matching customer name and vehicle plate by first resolving matching
ids from `customers`/`vehicles`, then filtering `contracts` by those
ids, combined with direct `contract_number`/`status`/`date`/`employee`
filters. Contracts live in their own table (not `documents`) since
phase 10 already gave them a much richer structured schema than a
generic document row could hold — "reservation" isn't its own filter
field since a contract has exactly one reservation, reachable from the
contract's own detail page instead of a redundant filter.

## Audit trail (requirement 9)

12 new `ACTIVITY_TYPES` cover every lifecycle transition, both
template-management events, and viewed/printed/downloaded. "Printed"
means the in-app Print button (which logs, then calls
`window.print()`) — a raw browser Ctrl+P bypasses the app entirely and
can't be intercepted from a web page; documented here as a known,
unavoidable gap rather than pretended away. "Viewed" logs on every
page load of `/contracts/[id]`, best-effort (a failed log never breaks
the page) — this can get noisy over many repeat views of the same
contract; a future phase could de-duplicate within a session, not
attempted here.

## Known limitations (intentional)

- **Everything in this phase is live-Supabase-only**, same as phase
  10 — `template-store.ts` calls `createClient()` unconditionally. The
  read-only pages (`/contracts`, `/contracts/[id]`) degrade to an
  empty list / `notFound()` in mock mode, matching the established
  convention; the preview/generation flow reproduces the same
  "Supabase is not configured" dev-mode error every mutation in this
  app already has in mock mode since phase 04 — confirmed live in the
  browser as the *same* failure class, not a new regression.
- **The `20260731090000_contract_lifecycle.sql` migration hasn't been
  applied to the live Supabase project** — same recurring situation as
  every table added since phase 03. The full lifecycle walk, signature
  auto-transition, amendment immutability, and search were verified
  instead via `lib/contracts/__tests__/template-store.test.ts`'s
  purpose-built in-memory fake Supabase client, not against real
  Postgres.
- **No government-compliant e-signature certification, no payment
  gateway integration, no jurisdiction-specific clause libraries** —
  explicitly out of scope per the phase brief's own non-goals,
  matching the bible's own "future scope" framing (Chapter 8 §19).
- **No amendment-driven document regeneration** — see above.
- **"Viewed" event volume isn't de-duplicated** — see above.
