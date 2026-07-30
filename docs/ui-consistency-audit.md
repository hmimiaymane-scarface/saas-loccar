# UI Consistency Audit

Roadmap phase 51, first phase of Wave 8 ("Polish, Observability,
Security, and Launch Confidence"). Brief: audit buttons, cards,
sheets, inputs, selectors, icons, empty states, table density, mobile
spacing, desktop spacing, destructive actions, confirmation patterns,
and status labels — "the product feels designed as one system."

Scope, per explicit instruction: audit + fix systemic/shared-component
issues, not an exhaustive hunt for every page-level one-off. The audit
itself was thorough (a dedicated research pass across all 13 areas);
the fix pass targeted the shared-component-level drift that pattern
surfaced, since fixes there cascade everywhere automatically.

## What the audit found already working well

Several areas turned out to be genuine strengths, not gaps — worth
recording so a future pass doesn't "fix" something that isn't broken:

- **Icons**: `lucide-react` is the only icon source anywhere in the
  app (confirmed by dependency check), and `size-4`/`size-5`/`size-6`
  sizing is used 230 times across 111 files — one stray legacy
  `h-4 w-4` was found, on a `<Skeleton>`, not an icon.
- **Empty states for real list pages**: 11 built list pages (customers,
  fleet, reservations, documents, payments, damages, expenses,
  activity, contracts, maintenance, notifications) all already reuse
  `EmptyPlaceholder` consistently. Only small embedded lists had
  invented their own — see below.
- **Table density**: only 2 files in the whole app render a real
  `<table>` (a reports table, the CSV importer's preview table), and
  both already use the same `px-3 py-2` cell density. Not enough real
  `<table>` usage anywhere for "density drift" to be a material
  problem.
- **Sheets/dialogs**: `Sheet` (bottom drawer) and `AlertDialog` are
  each used with real discipline — no ad hoc `fixed inset-0` overlay
  competing with them anywhere.
- **Status-color families**: the red/emerald/amber "danger/good/
  caution" families are used consistently for equivalent semantic
  meaning across every status config in `lib/status.ts` — a real
  strength, not luck; `docs/component-library.md`'s own changelog
  shows this was previously audited and enforced (contract status
  duplicating `lib/status.ts` was already caught and fixed once).

## What was fixed

**Textarea** (`components/ui/textarea.tsx`) — no shared component
existed; 16 files hand-copied the identical raw `<textarea>` className
(25 occurrences). Any future tweak to the shared input styling would
have silently missed every one of them. Swapped all 16 onto the new
component.

**Checkbox** (`components/ui/checkbox.tsx`) — four different stylings
coexisted (completely unstyled, `size-4 shrink-0` only, `rounded
border-border`, `rounded border-input`) across 11 instances in 10
files. One `accent-primary`-tinted component now, everywhere.

**Status configs** — `customer-status-control.tsx` had its own private,
undocumented `{value, label, tone}` array instead of an entry in
`lib/status.ts`, the one status enum in the app that had never
followed this codebase's own established rule (already enforced twice
before, per `contractStatusConfig`'s own changelog). Added
`customerStatusConfig` (new `CustomerStatus` type in
`types/rental.ts`), rendered through the shared `StatusBadge`.
`lib/platform-status.ts`'s `subscriptionStatusConfig` was missing the
`icon` field every other status config has (it could never render
through `StatusBadge` without one) and its `cancelled` state used an ad
hoc `bg-muted` pairing instead of the zinc family every other
closed/neutral status uses — both fixed, and all three platform pages
that rendered it via a raw `<Badge className=...>` now use
`<StatusBadge visual={...}>` instead.

**ListItemCard** (`components/domain/list-item-card.tsx`) — the
`rounded-3xl border border-border bg-card p-4 shadow-sm` list-row idiom
was hand-copied independently in 9 files (customer/member/document/
expense/maintenance/payment/damage/reservation list items, plus
`list-page-skeleton.tsx`). One polymorphic wrapper now (renders a
`Link` when `href` is passed, a plain `div` otherwise, so rows with
their own internal action buttons aren't forced into a click-through
link).

**FilterChip** (`components/domain/filter-chip.tsx`) — 4
`*-filters.tsx` components each hand-rolled an identical active/
inactive pill. Each file keeps its own selection logic (single-select
"All" + one active status vs. `reservation-filters.tsx`'s multi-select
toggle set) — only the pill's own look is shared now.

**Onboarding wizard's duplicated `NativeSelect`** —
`components/onboarding/onboarding-wizard.tsx` had a locally redefined
`selectClassName` duplicating `NativeSelect`'s own class string
verbatim for two `<select>` elements, despite `NativeSelect` already
being imported and used elsewhere in the same file. Now imports it for
those too.

**Destructive actions with no visual signal, and — the real safety
finding — no confirmation at all**: five genuinely irreversible
actions fired immediately on click, with no "are you sure?" step
anywhere: revoke invitation, remove passkey, delete an AI conversation,
discard a queued offline mutation, and suspend a teammate. None of
their underlying server actions accept a "reason" parameter, so rather
than force them onto the mandatory-reason `SensitiveActionConfirmDialog`
(which would need new backend/schema work — out of scope for a UI
pass), each now gets the lighter inline Cancel/Confirm swap already
established in this exact codebase (`document-delete-button.tsx`,
`member-row.tsx`'s own pre-existing "Remove" flow), with the confirm
button `variant="destructive"` — matching how every existing confirm
commit button in the app is styled. Reactivating a suspended member
(the restorative direction of the same toggle) stays a direct
one-click action; only the suspend direction is destructive.

**CustomerSearchCombobox** (`components/domain/reservations/
customer-search-combobox.tsx`) — `reservation-form.tsx` and
`new-rental-wizard.tsx` each independently reimplemented an identical
"type to filter, click a result" customer picker. Extracted the
presentational shell; each file keeps its own search-debounce timing
(one debounces on a timeout, the other searches on every change —
a genuine behavioral difference, not folded in).

**InlineEmpty** (`components/domain/empty-placeholder.tsx`) — 4 small
embedded lists (a sidebar, a search dropdown) each invented their own
"nothing here" text at different font sizes/padding. One shared
`text-sm text-muted-foreground` component now; alignment/padding stays
a per-caller `className` since that genuinely varies by context (a
left-aligned sidebar list vs. a centered "no search results" message).

**Desktop spacing** — `gap-6` is the unanimous convention across every
wizard-shaped component (`onboarding-wizard`, `customer-onboarding-
wizard`, `import-wizard`, `new-rental-wizard`) for their outer
single-column "stack of sections" container.
`company-settings-form.tsx`'s own outer `<form>` was the one outlier at
`gap-5` — normalized to `gap-6`. Detail pages' `gap-4`, also flagged by
the initial research pass, turned out on closer inspection to be a
structurally different role (a responsive grid's own gap, plus a
nested column's sub-stack) rather than a page-level outer container —
not a real instance of the same drift, so left as-is rather than
forced into a false equivalence.

## Deliberately not changed

- **`subscription-actions.tsx`'s own confirm-with-reason panel**
  duplicates `SensitiveActionConfirmDialog`'s job on the surface, but
  its reason field is deliberately *optional* (unlike the shared
  dialog's mandatory one — the underlying `setSubscriptionStatus`
  action already accepts `reason?: string`), and its inline-panel shape
  matches every other section on that same page (Trial/Plan/Dates all
  edit in place, no modals). Forcing it onto the shared modal dialog
  would make it *more* inconsistent with its own immediate context,
  not less — left as a considered non-fix, not an oversight.
- **The four checkbox-adjacent raw `<input>`s that are legitimate
  non-`Checkbox` cases** (hidden fields, file inputs) were confirmed
  during the audit and correctly left untouched.
- **Exhaustive page-level one-offs** beyond the shared-component drift
  above — per this phase's own stated scope, not chased down
  individually (e.g. no attempt to find every remaining bespoke
  spacing value on every page).

## Verification

tsc/eslint/vitest (755 tests)/build clean at every checkpoint. Full
production build succeeded (retried twice past a transient Google
Fonts fetch failure unrelated to any of this phase's changes).
