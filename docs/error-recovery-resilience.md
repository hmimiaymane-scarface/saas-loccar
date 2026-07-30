# Error Recovery and Resilience (roadmap phase 43)

Goal: replace technical failures with recoverable product states. For
every important action: a useful error message, retry, safe
navigation, no data loss, and a support/debug reference internally.
"Done when": a temporary failure rarely forces the user to restart a
workflow.

## What already existed (read first, not rebuilt)

This phase builds directly on several already-landed pieces rather
than starting cold:

- **Error boundaries** (`app/(dashboard)/error.tsx`, `app/global-error.tsx`,
  Productization wave 1 phase 8) — catch the dominant crash cause
  (`createClient()` throwing unconditionally in mock mode) across
  roughly 20 `actions.ts` files with one shared recovery screen.
- **`docs/failure-registry.md`** (same phase 8) — a real audit of
  crash-on-load/crash-on-click/misleading-success/hangs/lost-input,
  most fixed, a few explicitly left as documented, accepted gaps (e.g.
  desktop document upload's lack of retry logic).
- **`SubmitButton`/`useSlowPending`/`useSubmitGuard`** (phase 40) —
  idle/pending/slow/saved/error states with a built-in double-submit
  guard, already wired into 4 of ~61 hand-rolled loading-button call
  sites.
- **The offline queue** (phases 16/39) — durable retry for inspection
  field saves, photo/document uploads, and contract signatures in the
  pickup/return wizards, with an ambient header indicator and a review
  page for anything stuck.

This phase's job was closing the specific gaps those left, not
re-solving problems they already handle.

## What was found and fixed

### 1. Error boundaries had no safe navigation or debug reference

Both `error.tsx` and `global-error.tsx` offered exactly one button:
"Try again" — no way back to anywhere else, and nothing a user could
read out to support. Now both add a "Go back"/"Go to Overview" escape
and a support reference line (skipped for the demo-mode-limitation
message specifically, since that one already explains exactly what's
wrong and doesn't need a reference code to investigate).

**The reference** (`lib/error-reference.ts`) prefers Next's own
`error.digest` — populated in production, correlates what the user
sees with the actual server log entry without leaking the raw message
to the client — and falls back to a short, locally-derived hash (dev
mode, or a pure client-side render error where no digest exists) so
there's always *something* concrete to quote, never a silent gap. This
is deliberately **not** a real error-tracking service — no
Sentry/APM dependency exists in this app (checked `package.json`), and
adding one is a genuine, separate infrastructure decision that's out
of this phase's scope. If that infrastructure gets added later, this
reference is exactly what a real tracking service's own event id would
replace.

`global-error.tsx` stays true to its own "dependency-light, can't lean
on the rest of the component tree" design (a plain `<a href="/overview">`
hard navigation, not `next/link`/the router — this is the one place in
the app where client-side routing itself might be what's broken).

### 2. A real silent-error bug, found while auditing retry coverage

`MaintenanceDetailActions`'s "Start now" button set an error message on
failure but never rendered it — only the Complete/Cancel sub-views
did, not the view "Start now" itself lives in. A failed start showed
literally nothing. Fixed, and while touching this component, upgraded
all three of its action buttons (start/complete/cancel) onto the
phase-40 `SubmitButton` pattern for consistent saving/slow/error
states, rather than patching just the one missing `{error}` line.

### 3. No-data-loss draft persistence for pre-creation customer intake

The New Rental wizard's "new customer" quick-add fields (name, phone,
ID/licence numbers, dates) had no server-side backing until "Create
customer" actually succeeds — unlike the pickup/return wizards' steps,
which reconstruct their position from already-persisted DB state on
refresh. An accidental refresh or closed tab silently discarded
everything typed.

`lib/draft-storage.ts` (plain `localStorage` read/write/clear, no new
dependency — the same "no new infra for a modest problem" restraint
the offline queue already established for a related but distinct
concern) + `hooks/use-save-draft.ts` (debounced auto-save) now persist
just this step's text fields, restored once at mount into each field's
own `useState` initial value, and cleared on successful customer
creation or on picking an existing customer instead. **File objects
(the ID/licence scan photos) and their OCR extraction results are
deliberately NOT part of the draft** — a `File` can't survive `JSON`,
and re-showing extracted fields without the underlying photo would
misrepresent what was actually scanned, not genuinely restore it.

Verified live in the browser (mock mode): typed a name and phone,
confirmed the exact value landed in `localStorage`, did a full page
reload, and both fields came back pre-filled exactly as typed.

## What was reviewed and found already fine

Stated plainly rather than re-fixing what already works:

- **Pickup/return wizard finalization retry** (`activateRentalAction`/
  the completion actions) — deliberately online-only (not offline-queued,
  a documented scope boundary since phase 16/39), but already shows a
  clear, specific retryable message
  ("The inspection completed, but activating the rental failed — check
  your connection and try again.") and the Continue button (already on
  the phase-40 `SubmitButton` pattern) naturally allows retrying by
  clicking again. No fix needed.
- **Most `state.error`-driven forms already render their error inline**
  — sampled `vehicle-form.tsx`, `maintenance-form.tsx`, `expense-form.tsx`,
  `damage-form.tsx`, `document-delete-button.tsx`, `vehicle-status-actions.tsx`
  — all correctly show a message on failure today. The
  `MaintenanceDetailActions` bug above was the one real exception found,
  not a systemic pattern across the app.

## What this phase deliberately didn't do

- **Did not add a real error-tracking/APM service** (Sentry or
  similar) — see the reference-code reasoning above. A real service is
  the natural next step if this app ever needs production-grade error
  visibility beyond "a code the user can quote."
- **Did not migrate the remaining ~57 hand-rolled loading-button call
  sites onto `SubmitButton`** — same restraint phase 40 already stated;
  this phase touched exactly the one component with a confirmed bug,
  not a blanket migration.
- **Did not add draft persistence to every wizard step** — scoped to
  the one confirmed highest-value, lowest-risk case (pre-creation
  customer intake in the New Rental wizard). The pickup/return wizards
  and the standalone customer-onboarding wizard have their own
  step-by-step state and could adopt the same `lib/draft-storage.ts`/
  `hooks/use-save-draft.ts` pair later — deliberately not attempted in
  this pass given their size and the offline queue's already-different
  approach to a related concern there.
- **Did not attempt to trigger a genuine (non-demo-mode) crash live**
  to visually confirm the support-reference line renders — mock mode's
  dominant, near-universal crash cause is specifically the
  "Supabase is not configured" message, which is the one case the
  reference is deliberately hidden for (that message already explains
  the actual problem). The reference logic itself was verified by
  reading it directly (a small, pure, easily-inspectable function) and
  by confirming the demo-mode message correctly omits it live.

tsc/eslint/694 vitest tests (6 new)/`next build` all clean at every
checkpoint.
