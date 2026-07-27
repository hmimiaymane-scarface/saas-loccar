# Universal Search

Productization wave 2 phase 14 — "let owners find anything without
remembering where it lives." Most of this brief was already built by
the original roadmap's own phase 13 (`lib/search.ts#globalSearch` +
`components/domain/search/command-palette.tsx`), reachable on both
desktop (⌘K) and mobile (a real tappable search icon in
`mobile-shell.tsx` — not a keyboard-only affordance). This phase closed
the two real gaps that were left: document extracted-value search and
visually grouped results.

## What's searched, and how

Every field is `ilike '%query%'` — genuine substring matching, not
prefix-only — so a phone fragment (last 4 digits) or the middle segment
of a plate reliably finds the record, exactly the brief's own done-when
test:

| Entity | Fields matched |
|---|---|
| Vehicle | plate (`registration_number`), make, model |
| Customer | full name, phone |
| Reservation | reference |
| Contract | contract number |
| Document | filename, category, **and now extracted field values** |
| Employee | full name (in-memory, first 50 memberships) |

## Documents also match by extracted value now

`lib/documents.ts#searchDocumentIdsByExtractedFields` already existed
— built by the original roadmap's phase 04 for the `/documents` page's
own search box — but was never wired into `globalSearch`. Reused
exactly, not reimplemented: a document now matches by filename,
category, OR any OCR-extracted field value (licence number, plate,
customer name, etc.), deduplicated against filename matches before the
per-type limit is applied.

## Grouped results

`lib/search.ts#groupSearchResultsByType` (pure, unit-tested) sorts
results into one labeled section per entity type — Vehicles, Customers,
Reservations, Contracts, Documents, Team — in a fixed order, dropping
empty groups. The command palette renders a section header per group
instead of the old flat list with a small inline type badge per row.

## Known limitations (unchanged by this phase)

- Employee search only scans the first 50 memberships fetched, filtered
  in memory (`full_name.includes()`, not SQL) — a company with more
  than 50 employees could have unsearchable ones beyond that page. Not
  fixed here; flagged as a pre-existing, minor gap.
- A query must be at least 2 characters — a single character never
  searches.
- No normalization of dashes/spaces before comparison (e.g. a plate
  typed with different spacing than stored) — a soft edge case, not
  addressed by this phase.
