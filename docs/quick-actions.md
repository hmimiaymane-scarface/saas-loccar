# Quick Actions

Productization wave 2 phase 13 — "make frequent actions instant." The
mobile bottom nav's center "+" (`components/layout/mobile-bottom-nav.tsx`)
opens `QuickActionsSheet` (`components/layout/quick-actions-sheet.tsx`),
a bottom sheet with one pinned dominant action and 5 reorderable ones.
Desktop has no equivalent — this has always been a mobile-only concept
(no FAB/action-menu scaffolding exists in `DesktopShell`/`Sidebar`/
`Header`), and this phase didn't add one.

## The action set

| Action | Destination |
|---|---|
| **New Rental** (pinned, dominant) | `/reservations/new` |
| Return Vehicle | `/reservations?status=active` |
| Record Payment | `/payments` |
| Add Expense | `/expenses/new` |
| Add Customer | `/customers/new` |
| Add Vehicle | `/fleet/new` |

Every destination is a real, already-existing standalone page — no new
routes were built for this phase.

## New Rental is pinned, not just first

The brief's "New Rental is visually dominant" is a full-width primary-
colored CTA above the grid, always in that exact spot regardless of
usage — visual dominance and recency-ordering are two different rules,
and pinning one action while reordering the rest is how both are
satisfied at once without contradicting each other.

## Recently-used ordering

The 5 secondary actions reorder by recent usage via
`lib/quick-actions-recency.ts`:
- `recordQuickActionUsage(label)` is called on every action tap
  (including New Rental, so the mechanism is exercised even though its
  own position never moves).
- `orderByRecency()` is the pure, unit-tested core — no history means
  the brief's own given order; a used action moves to the front,
  most-recent-first; anything never used keeps its original relative
  order after the used ones.
- Storage follows this app's one existing client-side-persistence
  precedent exactly (`components/pwa/install-prompt.tsx`'s dismiss
  flag): a single namespaced `localStorage` key
  (`rentalos:quick-actions-recent`), read in a `useEffect` after mount
  to avoid a hydration mismatch — before that effect runs, the sheet
  renders the same default order the server already rendered, so
  there's nothing to reconcile.

## Known, documented limitation: "Return Vehicle"

Tapping it lands on `/reservations?status=active` — the filtered
reservations list, not a specific reservation's return flow. There's no
ambient "which vehicle" context at the moment the FAB is tapped, so a
direct link to one reservation's return page isn't possible without a
new vehicle/reservation-picker step first — a separate, larger feature
this phase didn't take on. The list is at least the *right* list (only
currently-active rentals), not an irrelevant dashboard.
