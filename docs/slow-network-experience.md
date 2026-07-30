# Slow-Network Experience (roadmap phase 40)

Goal: on a weak connection, the app should read as "working," never
"frozen" or "did that click even register."

## What exists now

### `SubmitButton` + `useSlowPending` / `useSubmitGuard`

The overwhelming majority of this app's mutating forms already used
`useActionState`'s own `isPending` for a spinner (61 files, 136 call
sites at the time this phase started) — rewriting all of them onto a
new abstraction would be exactly the kind of churn this codebase's own
conventions warn against. Instead:

- **`hooks/use-slow-pending.ts`** wraps an existing `isPending` boolean
  and flips `isSlow` true if it's *still* pending 6 seconds later — the
  "still working, hang tight" signal on top of the spinner that's
  already there.
- **`hooks/use-submit-guard.ts`** is the equivalent for an imperative
  action that isn't a form submission (a dismiss button, a toggle) —
  idle → pending → slow → saved/error, with an in-flight ref guard so a
  rapid double-click can't start a second call while the first is still
  running.
- **`components/ui/submit-button.tsx`** renders whichever of the two
  hooks' `status` a caller passes: idle (children as-is), pending
  (spinner + "Saving…"), slow (spinner + "Still working…"), saved
  (check + "Saved", green), error (alert triangle + retry label,
  destructive styling).

Wired into: `reservation-form.tsx`, `wizard-footer.tsx` (pickup/return
wizard Continue), `customer-edit-form.tsx`, `record-payment-form.tsx`.
The latter two previously had **no confirmation at all** after a
successful save — the customer edit card just sat there, and the
payment form stayed populated with no reset, which is a real
duplicate-submission risk for a form recording money. Both now show a
real "Saved" pulse; the payment form also resets its fields and the
reservation-select state on success.

**Not every call site was migrated** — this phase touched the four
highest-traffic mutating flows deliberately, not all 61 files. The
remaining hand-rolled `isPending`+`Loader2` call sites are unaffected
and can move onto `SubmitButton` opportunistically; nothing about it is
a breaking change to the pattern they already follow.

### Skeleton loading states

`components/ui/skeleton.tsx` (a plain pulsing `div`, the same
"one shadcn primitive this app didn't have yet" pattern as phase 02's
`Progress`) + `components/domain/list-page-skeleton.tsx` (a shared
grid/list body approximating each real list item's
`rounded-3xl border border-border bg-card p-4 shadow-sm` shell) feed
`loading.tsx` files for `/fleet`, `/customers`, `/reservations`, and
`/overview` — these previously rendered fully blank while their
server-side data fetches resolved. This is Next's own route-segment
Suspense convention: no `page.tsx` changes were needed, since an async
Server Component page already suspends the moment a sibling
`loading.tsx` exists.

Overview's skeleton deliberately doesn't try to pixel-match every one
of its dozen-plus sections (Business Pulse, Revenue Intelligence,
health rollups, gamification highlights, etc.) — just the "hero stats,
a big card, a two-column area" shape, so the transition from skeleton
to real content doesn't visibly jump in overall structure without a
large, low-value effort to mirror every section exactly.

### Optimistic dismiss (Operations Feed / Needs Attention)

`operations-feed-list.tsx` and `needs-attention-section.tsx` both used
to wait on the full server round trip (dismiss action, then
`router.refresh()`) before an item visibly left the list. Both now use
`useOptimistic` to remove the item the instant it's clicked; if the
server call fails, the transition ends without `router.refresh()` ever
changing the base `items`/`cards` prop, so the optimistic list reverts
to including it again.

**This is deliberately scoped to dismiss only, not applied elsewhere.**
The reasoning, stated once here since both components' own comments
point back to it: dismissing an Operations Feed item is safe to show
before the server confirms because it's (a) reversible in spirit — the
reconciler in `lib/operations-feed/run.ts` re-surfaces an item if the
underlying condition resolves and later recurs, so an incorrectly-shown
dismissal isn't a lost write, and (b) touches no money or inventory
state. Reservation, payment, and deposit actions elsewhere in this app
do **not** get this treatment — they stay on the wait-for-the-server
pattern on purpose, matching this codebase's existing restraint around
what "safe to fake" actually means (see phase 11's identical
draw-the-line reasoning around contract generation vs. the reservation
form's advisory-only readiness checks).

## What this phase deliberately didn't do

- **Did not build a toast/snackbar system.** No such system existed
  before this phase (checked `package.json` and grepped for
  `toast`/`sonner` — nothing). `SubmitButton`'s inline saved/error
  states cover the "confirm this specific action" case this phase
  actually asked for; a global toast system is a larger, separate
  addition with its own design questions (stacking, dismissal,
  positioning on the mobile shell) out of scope here.
- **Did not migrate all 136 hand-rolled loading-button call sites** —
  see above.
- **Did not add per-request timeouts or `AbortController` cancellation**
  to server actions. Next.js Server Actions don't expose a client-side
  cancel handle the way a raw `fetch` does, and the existing offline
  queue (phases 16/39) already owns the "this genuinely isn't working,
  fall back to a durable local queue" concern for the field-capture
  flows that need it. This phase's "slow" state is honest about that:
  it tells the user something is still in flight longer than usual, it
  doesn't invent a fake cancel button for an action that can't actually
  be cancelled.
- **Did not add unit tests for the two new hooks.** Per this repo's own
  established testing convention (`AGENTS.md`), there's no
  component-rendering test infra (`vitest` runs `environment: "node"`,
  no jsdom/React Testing Library) — a deliberate choice made in phase
  02 and left standing since. `useSlowPending`/`useSubmitGuard` are
  `useState`/`useEffect`-based, not pure functions, so they fall on the
  "verify live in the browser" side of that line rather than the
  "hand-fixture unit test" side.

## Verification account (honest, not just "it works")

Real browser pass in mock mode
(`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev`),
light and dark:

- **Confirmed live**: `/fleet`, `/customers`, `/reservations`,
  `/overview` all render correctly post-navigation with zero console
  errors (the skeleton itself renders too fast to screenshot reliably
  against local mock data — expected, since there's no real network
  latency in this environment to stretch it out).
- **Confirmed live**: the payment form's `SubmitButton` correctly shows
  the disabled "Saving…" spinner state immediately on click, and three
  rapid clicks in the same spot produced exactly one submission (one
  spinner, one eventual crash to the pre-existing `error.tsx` boundary
  — see below) rather than three.
- **Confirmed live**: dark mode renders the button states without
  contrast issues (forced via
  `document.documentElement.classList.add('dark')`, this app's
  established no-real-toggle-yet convention since phase 02).
- **Hit the same pre-existing mock-mode gap every phase since 04 has
  documented, not a new one**: every mutating server action
  (`recordPayment`, `updateCustomerProfile`, `createReservation`, etc.)
  calls `createClient()` unconditionally and throws *before* returning
  a typed `{error}` result, which trips the route's `error.tsx` safety
  net (phase 8) instead of ever reaching `SubmitButton`'s own
  destructive "error" branch. That branch — and the "Saved" pulse on
  the customer-edit and payment forms specifically, since both require
  the mutation to actually resolve successfully — could **not** be
  exercised live in this environment for the same reason document
  create/edit, contract generation, and every other mutation-adjacent
  flow has carried this exact caveat since phase 04. Apply this app's
  outstanding migrations to a real Supabase project to close this gap,
  same standing instruction as every prior phase.
- **Not reachable live**: the optimistic-dismiss removal on Operations
  Feed / Needs Attention. Mock mode's fixture data has no
  `operations_feed_items` rows, so every Needs Attention card in mock
  mode comes from `getLiveAlerts` with `dismissible: false` — there is
  currently no dismissible item to click in mock mode at all (confirmed
  by fetching the rendered `/overview` HTML and checking for a
  "Dismiss" button — none present). The `useOptimistic` wiring was
  verified by reading the resulting code path closely instead
  (`dismissOptimistically(id)` runs synchronously before the `await`,
  and the list's `.filter()` reducer is straightforward), consistent
  with this codebase's practice of stating what wasn't reachable rather
  than claiming untested code paths work.
