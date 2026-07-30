# Offline queue hardening (roadmap phase 39)

## What this phase found

Phase 16 built the offline queue (`lib/offline/db.ts`, `lib/offline/sync.ts`,
`hooks/use-offline-queue.ts`) and it's genuinely solid in several places:
idempotency keys backed by real DB-level partial unique indexes on
`(company_id, idempotency_key)` for `media`/`documents`/`damages`
(`supabase/migrations/20260803090000_mobile_field_foundation.sql`), a pure
and already-tested dependency-ready check, and a careful three-way
retry/needs_review/success split. Auditing it against the brief's 7 named
failure scenarios (connection loss during photo upload, connection loss
during inspection, app backgrounding, browser restart, partial workflow,
duplicate sync, conflict on reconnection) — by reading the actual code, not
assuming it already worked — found two real bugs and one systemic
visibility gap.

### 1. A rejected dependency was treated as satisfied

`syncOfflineMutations` (`lib/offline/sync.ts`) pre-seeded its "done" set
with every `needs_review` mutation's id. `isMutationReady` then saw a
dependency stuck in `needs_review` — a REAL rejection, e.g. a photo attach
that failed validation — as already resolved, so `completeInspection`
(which depends on every photo/field mutation queued that session) could run
and mark an inspection complete even though a required photo never
actually saved. Fixed by only counting a mutation as done once it actually
synced in that pass; a `needs_review` dependency now correctly keeps its
dependents blocked. A red-green unit test in
`lib/offline/__tests__/sync.test.ts` reproduces the bug against the old
code (confirmed failing) before the fix, then passes.

### 2. The "online" path had no failure fallback

Every queue-integrated write's `!isOnline` branch queues instead of calling
the server directly — but the `isOnline` branch just called the server
action with no try/catch. `hooks/use-offline-queue.ts`'s own doc comment
already named the real gap this misses: "a connection that LOOKS online
per `navigator.onLine` but individual requests keep failing." When that
happened on `saveInspectionStep`/`complete()`/`activate()` in either
wizard, or the `PhotoUploadGrid`/`AdditionalPhotos` `onUpload` callbacks
wired to `attachInspectionMedia`, the promise rejected, nothing queued, and
the field data (or an already-uploaded photo's metadata) was silently
lost with no error shown. This was the single most serious gap and maps
directly to "connection loss during inspection"/"during photo upload."

Fixed by wrapping each direct call in try/catch and falling back to the
same `enqueue(...)` the offline branch already uses. For the photo-attach
case specifically, the underlying Storage upload had already succeeded
(`PhotoUploadGrid` only calls `onUpload` after that) — only the metadata
call failed — so the fallback queues an `attachInspectionMedia` mutation
carrying the *already-uploaded* `storagePath`/`fileName`/`mimeType`/
`fileSizeBytes` directly, rather than re-uploading the file a second time.
`lib/offline/sync.ts`'s dispatch case for `attachInspectionMedia` now
branches on whether `storagePath` is present in the payload.

`completeRentalAction`/`activateRentalAction` (the step right after
`completeInspectionAction` in each wizard's completion flow) have no
offline-queue mutation type at all — they're out of phase 16's
field-capture scope (deposits/vehicle status, not inspection data). A
network failure there surfaces a clear retryable error ("the inspection
completed, but finishing the return failed...") rather than an unhandled
rejection, since there's no mutation type to queue it as.

The same unguarded-direct-call pattern was found (via the same grep-based
check this session already established in prior phases) in two more
places and fixed for consistency:
- `components/domain/documents/document-upload-row.tsx` — falls back to
  its existing `onQueueOffline` prop on a thrown exception, same as the
  `upload.error` branch right next to it already did.
- `components/domain/damages/damage-photo-upload.tsx` — damages were
  never part of phase 16's offline scope (no `onQueueOffline` prop
  exists), so this one only gets a try/catch surfacing a clear retryable
  error, not a new offline-queue integration.

### 3. Nothing anywhere surfaced `needs_review`

`useOfflineQueue` computed `needsReviewCount` but no component read it —
`OfflineStatusBanner` only took `isOnline`/`pendingCount`.
`lib/offline/sync.ts`'s own doc comment has always promised a rejection is
"never silently dropped and never silently overwritten — a human looks at
it," but nothing ever rendered that. Compounded by there being no
global/app-shell awareness of the queue at all — only the three workflow
components ever called `useOfflineQueue`, so an employee who queued
something and didn't personally return to that exact reservation (or
whose browser restarted onto a different page) had no way to discover
unsynced or stuck work existed anywhere.

Fixed with two additions:
- **`OfflineQueueIndicator`** (`components/layout/offline-queue-indicator.tsx`),
  mounted in `MobileShell` — live on every mobile page, not just the
  originating wizard. A quiet header icon with a badge (amber `CloudOff`
  for needs-review, neutral spinning `RefreshCw` for still-syncing),
  linking to...
- **`/offline-queue`** (`app/(dashboard)/offline-queue/page.tsx` +
  `components/domain/offline-queue-review-list.tsx`) — lists each queued
  mutation in plain language (type, when it was queued, its error
  message, a best-effort link back to where it was captured derived from
  whatever id the payload carries), with a Discard action for
  needs-review items a human has resolved outside the queue. Deliberately
  not added to `MobileBottomNav` (same "detail route, not primary nav"
  precedent phase 12's `/operations-feed` already used).
- `OfflineStatusBanner` (still used inline in both wizards, closer to the
  point of capture) now also reflects `needsReviewCount`, with a direct
  link to the review page.

## What was deliberately not built

- **A per-mutation "retry in place" editor.** The existing wizards are
  already the correct place to redo the underlying action; the review
  page's job is visibility and letting a human discard what they've
  already resolved elsewhere, not duplicate every mutation type's edit UI.
- **A cross-tab/process lock on `syncOfflineMutations`.** `syncingRef`
  only guards one hook instance; two tabs syncing concurrently could in
  theory both attempt the same mutation. This is safety-netted by the
  real DB-level partial unique indexes already in place for the three
  insert-type mutations — a losing race errors out (now visible via
  finding 3's fix) rather than silently duplicating. Not rebuilt into a
  new distributed lock, which would be real new infrastructure
  disproportionate to "harden what exists."
- **A real multi-writer conflict-resolution system** for "conflict on
  reconnection." Inspections are single-operator drafts (documented since
  phase 16); the existing `isAlreadyAppliedMessage` replay handling
  already covers the realistic case of a lost response being retried.

## Verification

tsc/eslint/vitest (682 tests, 1 new)/`next build` all clean at every
checkpoint.

**Real, passing tests, not just reasoning:** the dependency-bug fix
(finding 1) has a red-green unit test in `sync.test.ts` that reproduces
the exact failure mode (a `completeInspection`-shaped mutation depending
on a `needs_review` photo mutation) against a mocked dispatch loop —
confirmed failing against the old code, passing after the fix.

**Live browser verification** (mock-mode dev server, `claude-in-chrome`):
seeded `rentalos-offline`'s IndexedDB directly with a `needs_review` and a
`pending` mutation (bypassing the app's own write path, since mock mode's
existing "Inspections require a connected Supabase project" gate — the
same limitation phases 30 and 38 already found — blocks reaching the
wizards' actual inspection step) and confirmed:
- `/offline-queue` renders both sections correctly, with the error
  message, the derived link, and a working Discard button that removes
  only the needs-review item.
- `OfflineQueueIndicator` renders the amber `CloudOff` badge with the
  correct count in the mobile shell's header (both shells mount
  simultaneously per `AppShell`'s existing design, one hidden via
  Tailwind's `lg` breakpoint — confirmed by forcing the CSS visible for
  the screenshot pass) and its link correctly navigates to
  `/offline-queue`.
- Both surfaces render correctly in dark mode (forced via
  `document.documentElement.classList.add('dark')`, this app's established
  no-toggle-exists workaround) with no contrast issues.
- **Browser restart**: a full page navigation/reload (not just an
  in-app route change) still shows both seeded mutations afterward —
  confirms IndexedDB durability across a reload end-to-end, not just
  asserted from the API's nature.
- Zero console errors throughout.

**Known, stated-not-glossed-over verification gap**: the wizard-level
try/catch fallback logic itself (finding 2 — `saveInspectionStep`,
`complete()`/`activate()`, the photo-grid `onUpload` callbacks) was
verified by the full tsc/lint/test/build gate and code review, but not by
an actual live click-through forcing a mid-request network failure inside
a real inspection flow — the same "Inspections require a connected
Supabase project" mock-mode gate above blocks reaching that step at all,
independent of anything this phase changed. A human with a real Supabase
project should exercise this directly (e.g. DevTools network throttling
mid-save) before fully trusting it in production.
