<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architectural patterns for this repo

Written in roadmap phase 20 (the final, consolidation phase), after 19
phases of real feature work had a chance to establish real patterns
rather than guessed-at ones. These are the conventions to follow when
extending this app, not a description of any one feature — see `docs/*.md`
for that (each domain has its own doc: `docs/permissions.md`,
`docs/notifications.md`, `docs/contracts.md`, `docs/security.md`,
`docs/component-library.md`, etc.).

## How a module requests AI

Two shapes exist, for two different jobs — don't blur them.

- **`askAI()`** (`lib/ai/service.ts`) is the platform service for a
  single structured-output call: pass a `prompt` + a zod `schema`, get
  back a typed result with a coarse confidence level, gated by
  `allowedRoles` (or a `requiredPermission` for finer-than-role
  granularity) or a `SystemCaller` for background jobs with no signed-in
  user. This is what every intelligence feature (vehicle/customer
  summaries, the Operations Feed's pricing review, contract template
  mapping and preview review) uses. **New AI-assisted features should
  call `askAI()`, not build a second ad hoc model-calling path.**
- **The AI Assistant's tool-calling loop** (`app/api/ai-assistant/chat/route.ts`,
  `lib/ai/tools.ts`) is a different shape entirely — multi-turn,
  streaming, tool-calling — and exists only for the chat feature itself.
  Every "write" tool only ever inserts a proposal row (`ai_proposed_actions`);
  a human must click Confirm, which replays the exact same server action
  a manual click would call, with the exact same `requireSession()`/
  `requireRole()`/`has_permission()` checks. Don't add a new mutation
  path here that skips that gate.
- **Every AI prompt should include an explicit tone guard**: "Plain
  business language, never chat-bot voice." (verbatim, or close to it —
  see `lib/vehicle-recommendations.ts`/`lib/customer-summary.ts` for the
  original wording). This was audited and added to every prompt in
  phase 20; keep it in any new one.

## How a new Operations Feed observer gets added

Each observer is a pure function in `lib/operations-feed/observers.ts`:
`evaluate<Thing>(input): FeedItemDraft | null` (or `FeedItemDraft[]` for
one that can produce several items per input row). It takes plain data
— never a Supabase client — and returns a draft or `null` if nothing's
wrong. `lib/operations-feed/run.ts` is the only place that fetches real
rows and calls these; it reconciles the resulting drafts against
`operations_feed_items` keyed on `(company_id, observer_type, entity_type,
entity_id)` — a dismissed item stays dismissed even if the condition
still holds, only re-surfacing if it resolves and later recurs. A new
observer needs: the pure `evaluate*` function (with its own hand-fixture
unit test, covering both the "flags" and "stays quiet" cases), a fetch +
call site in `run.ts`, and — if it needs real judgment rather than a
deterministic threshold — an `askAI()` call reviewing candidates in one
batched request per company, never one call per candidate (see
`lib/operations-feed/pricing-ai.ts` for the pattern). Name any new
threshold in `lib/operations-feed/thresholds.ts`, don't inline a magic
number.

## How a new document type/category gets supported

`DocumentCategory` (`types/rental.ts`) is the source of truth, mirrored
by the `documents.category` CHECK constraint. `lib/document-categories.ts#CATEGORY_OPTIONS`
is the `{value, label}` list every form/filter renders from — it lives
in its own leaf module (not `lib/documents.ts`) specifically to avoid an
import cycle with `lib/document-extraction.ts`; keep new category-list
consumers importing from there, not duplicating the list. If the new
category needs OCR extraction, add its zod schema to
`lib/document-extraction.ts#schemaForCategory` — extraction is
opt-in per category, not automatic. Every document upload path
(`createDocumentRecord`, `attachInspectionMedia`, `attachDamageMedia`)
must validate through `lib/storage.ts#validateUploadForCompany()` before
persisting a row — see `docs/security.md`'s "Document security" section
for why this was added in phase 19 and what it does and doesn't verify.

## How a new permission-gated table gets wired up

`has_permission(company_id, key)` (SQL, phase 17) is the primitive:
checks a non-expired per-employee override first, falls back to the
caller's role default, else `false`. To gate a new table's RLS:

1. Add the permission key to `lib/permissions/catalog.ts` (the fixed,
   hand-maintained list — every key here should be one something
   actually checks, not aspirational; phase 19 found and fixed a case
   where a key existed in the catalog for months with nothing enforcing
   it).
2. Seed `role_permission_defaults` for every role, matching **today's
   actual effective access** if replacing an existing coarser check —
   never silently regress an existing role's access without deciding to
   (and documenting why, if it's deliberate — see `docs/permissions.md`'s
   own precedent for driver/cleaner/mechanic).
3. Use `has_permission(company_id, 'your_key')` in the RLS policy itself,
   not just in application code — RLS is the actual security boundary
   (see `docs/security.md`'s opening line).
4. If an AI tool or `askAI()` caller touches the same data, gate it too
   — `lib/ai/tools.ts`'s `resolveToolPermissions()` is the pattern for a
   one-round-trip-per-conversation-turn permission check.

## How a new notification type gets added

Add it to `NotificationType` (`types/rental.ts`) and the matching DB
CHECK constraint in the same migration — phase 19 found a case where
these drifted (a migration added values the TS union never got). Give
it a real `actions: NotificationAction[]` array at creation time (never
just a bare title+description — "never 'Vehicle overdue' alone" is a
hard requirement, not a nice-to-have) using `lib/notifications/actions.ts#callAndOpenActions`
where a customer phone number is available, a plain `{label, href,
kind:"link"}` otherwise. Use `public.notify()` (SQL callers) or
`lib/notifications/service.ts#notify()` (TypeScript callers) — never a
raw `insert into notifications`, so every notification goes through the
same shared write path. If the type represents a genuine stored one-off
event (not a recomputed live alert), decide up front how it gets
resolved/cleared later — an unresolved stored notification left to rot
forever is exactly the bug phase 19 found and fixed in the
approval-workflow's own first implementation.

## Testing conventions

- **Pure functions first.** The overwhelming majority of this repo's
  logic — permission resolution, aging, observers, intelligence scoring,
  contract variable resolution — is written as a plain function taking
  plain data and returning plain data, with zero Supabase dependency,
  specifically so it's unit-testable without a live database. When
  something needs both a pure core and a DB-touching shell, split it
  that way on purpose (see `lib/customer-intelligence-store.ts` vs.
  `lib/customer-intelligence.ts`, or `lib/webauthn/lockout.ts` vs. the
  route that calls it).
- **No live Postgres/Docker access exists in this environment.** Every
  phase since 03 has carried this limitation — RLS itself can never be
  exercised by an automated test here, only by a human applying
  migrations to a real Supabase project. Where a DB-touching function
  needs a test anyway, use an in-memory fake Supabase client — either a
  narrow, single-purpose one in the test file itself (see
  `lib/contracts/__tests__/template-store.test.ts#makeFakeSupabase`), or
  the shared, more general one at `lib/__tests__/helpers/fake-supabase.ts`
  (built in phase 19 specifically for cross-tenant-isolation-style tests
  that need the same chain shapes across many different tables/modules).
- **A function that calls `createClient()` internally** (rather than
  taking a client as a parameter) can still be tested end-to-end by
  mocking `@/lib/supabase/server`'s `createClient` export with `vi.mock`
  — see `lib/__tests__/activity-log.test.ts`'s `createCustomer` test or
  `lib/__tests__/document-access-logging.test.ts` for the pattern. No
  separate auth mock is usually needed: `requireSession()` resolves to
  this repo's fixed mock identity (`lib/mock/company.ts`) whenever
  `isSupabaseConfigured` is false, which it always is under vitest.
- **Real browser verification, not just green tests.** `tsc`/`lint`/`test`/`build`
  passing is not sufficient proof a feature actually works — several
  real bugs across this roadmap (a client/server prop-passing mismatch,
  an `autoFocus` side effect, two independent global-search listeners
  firing) were only caught by actually clicking through the running app
  in mock mode (`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev`
  — setting both to an empty string, not unsetting them, is the correct
  incantation; `.env.local`'s real values otherwise fill the gap back
  in), in both light and dark themes.
- **A hydration-mismatch warning that only names className string
  *ordering* (not different content) after several rapid edits to a
  `"use client"` component, during the same long-running `next dev`
  session, is very likely a stale Turbopack dev cache** — not a real
  bug in the component. Verified this directly in phase 20: the same
  warning appeared, persisted across a hard reload, then disappeared
  completely after `rm -rf .next` + a full server restart, with no
  source change in between. Try that before spending time debugging the
  component's own logic.
