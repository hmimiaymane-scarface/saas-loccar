# Component library

Roadmap phase 20 (the final, consolidation phase). This is not a from-scratch
design system — it's an inventory and audit of the reusable UI pieces that
organically emerged across phases 02, 06-13, and 16-18, written down now that
they've proven themselves across real features (the bible's own argument for
why this phase comes last, not first).

**See `docs/mobile-design-system.md` (productization wave 1 phase 9)**
for the mobile-specific rules (spacing, type hierarchy, touch targets,
bottom sheets, motion, haptics) built on top of `lib/tone.ts`/`lib/status.ts`
below.

**No Storybook or MDX docs tool exists in this repo, and this phase doesn't
introduce one** — `package.json` has zero such dependencies. The existing,
matched convention is: inline JSDoc-style comments directly above each
component (explaining intent, linking back to the relevant bible
chapter/section and roadmap phase) plus this file, following the same
per-domain `docs/*.md` pattern as `docs/permissions.md`/`docs/notifications.md`.
A live, mock-data-driven reference gallery already exists too:
**`/dev/intelligence-components`** (`app/(dashboard)/dev/intelligence-components/page.tsx`)
— reachable by URL only, deliberately not linked from nav, demonstrating the
six phase-02 intelligence primitives with a light/dark toggle.

## The token layer: `lib/tone.ts`

The closest thing this app has to a design-token file. Everything below
builds on it rather than inventing its own color logic:

- `Tone = "positive" | "warning" | "critical" | "neutral"` — the base
  4-value semantic palette.
- `toneClasses: Record<Tone, { badge, text, icon, fill }>` — the actual
  Tailwind class bundles (light + dark variants baked in). **Any new
  status/priority/confidence UI should map onto one of these four tones and
  use `toneClasses` directly rather than hand-rolling a new color map** —
  see "Design token fixes" below for two places that didn't, until this
  phase.
- `InsightPriority = "critical" | "operational" | "important" | "informational"`
  + `insightPriorityTone` — the 4-tier severity vocabulary shared by the
  Operations Feed, the Business Command Center, and the Notification Center
  (phase 18 moved this here from `insight-feed-item.tsx`, since it's shared
  vocabulary, not one component's concern; that file re-exports the type so
  existing imports kept working).
- `confidenceTier(percent)` / `scoreBand(value)` — the two named numeric
  bands used everywhere an AI confidence or a 0-100 score needs a
  Healthy/Needs Attention/Critical-style label instead of a raw number.

For non-tone status enums (vehicle status, booking status, etc.),
`lib/status.ts` is the equivalent single source of truth: `Record<Enum,
{label, icon, dot, badge}>`. `contractStatusConfig` was added there this
phase (see below) — **a new status enum should get an entry there, not a
private color map in its own component file.**

## Intelligence primitives (phase 02)

### `ConfidenceIndicator` — `components/domain/intelligence/confidence-indicator.tsx`
One inline badge for "how sure is the AI about this value" (0-100 `percent`
prop). Deliberately quiet at high confidence (muted text/icon, no color —
"high-confidence information should continue automatically") and only
becomes bold + colored as confidence drops below the `warning`/`critical`
bands from `confidenceTier()`. No loading/empty state — a pure presentational
leaf; the caller always has a resolved number by the time this renders.

```tsx
<ConfidenceIndicator percent={92} />
```

### `ScoreIndicator` — `components/domain/intelligence/score-indicator.tsx`
The shared visual for any 0-100 health/trust/profitability score: a label, an
animated percentage, a progress bar, and the bible's Healthy / Needs
Attention / Critical badge (`scoreBand()`). Used for Fleet Health, Trust
Score, and Profitability across the vehicle and customer intelligence cards
alike — one component, three different meanings, decided entirely by what
`label`/`value` the caller passes.

```tsx
<ScoreIndicator label="Fleet Health" value={vehicle.healthScore} />
```

### `AiRecommendationCard` — `components/domain/intelligence/ai-recommendation-card.tsx`
The canonical shape for any AI-generated suggestion anywhere in the app:
observation, reasoning, a highlighted suggested-action pill, a
`ConfidenceIndicator`, and Accept/Dismiss buttons. Enforces "AI recommends, a
human decides" structurally — there is no prop for auto-executing anything;
`onAccept`/`onDismiss` are just callbacks the caller wires to its own
confirm/dismiss logic.

```tsx
<AiRecommendationCard
  observation="Utilization dropped 18% this month."
  reasoning="3 fewer rentals than the prior 90-day average for this category."
  suggestedAction="Consider a short-term rate promotion."
  confidence={78}
  onAccept={handleAccept}
  onDismiss={handleDismiss}
/>
```

Roadmap phase 29 added one optional prop, `comparisonImages` — a
before/after photo pair (used by the return wizard's AI damage
comparison to show the actual pickup and return photos, not just a text
description) rendered as two labeled thumbnails above the observation
text, each linking to its full-size image. Undefined for every other
consumer of this card — purely additive, no layout change when absent.

### `InsightFeedItem` — `components/domain/intelligence/insight-feed-item.tsx`
A lighter feed row for a scrolling list (the Operations Feed): icon + title +
description, colored by `priority: InsightPriority`, an optional single
action button, and a dismiss button. Only `critical`/`important` get a
strongly colored icon — `informational` stays neutral so the feed doesn't
read as "everything is urgent."

```tsx
<InsightFeedItem
  priority="operational"
  title="Vehicle idle 6 days"
  description="Dacia Logan (12-A-345) has had no bookings since Jul 20."
  actionLabel="View vehicle"
  onAction={openVehicle}
  onDismiss={dismissItem}
/>
```

### `EntityTimeline` — `components/domain/intelligence/entity-timeline.tsx`
A vertical activity timeline for one entity (vehicle, customer, contract) —
"every vehicle has a story," rendered generically over the same
`ActivityItem` shape phase 01's event backbone produces. Reuses
`activity-feed-card.tsx`'s icon-per-activity-type map rather than
duplicating it. Explicit empty state ("No activity yet."); semantic
`<ol>/<li>` markup.

```tsx
<EntityTimeline items={vehicleActivity} />
```

### `DocumentConfidenceRow` — `components/domain/intelligence/document-confidence-row.tsx`
One OCR-extracted field with an accept-or-correct affordance. A small state
machine driven by `confidenceTier()`: a field extracted at `critical`
confidence starts open for editing automatically; anything higher starts
read-only until the user taps the pencil. Already has a proper `aria-label`
on its icon-only accept/correct button.

```tsx
<DocumentConfidenceRow label="Full name" value="Ahmed Tazi" confidence={64} onChange={handleCorrect} />
```

## Mobile shell components (phase 16)

- **`MobileShell`** (`components/layout/mobile-shell.tsx`) — the genuinely
  distinct mobile product (not `DesktopShell` reflowed): compact sticky top
  bar (company identity + search/notifications/user menu) and a fixed bottom
  tab bar. Renders `InstallPrompt` inline. Receives the exact same
  server-fetched props `DesktopShell` does — same data, different layout,
  chosen by `AppShell` based on viewport.
- **`MobileBottomNav`** (`components/layout/mobile-bottom-nav.tsx`) — 4 tabs
  from `mobilePrimaryNav` (role-invariant since productization wave 1 phase
  10), split left/right around an always-rendered elevated center FAB. Uses
  `aria-current="page"` on the active tab.
- **`QuickActionsSheet`** (`components/layout/quick-actions-sheet.tsx`) —
  the FAB's bottom sheet. Role-invariant since phase 10 (every action is
  `{label, href, icon}`, no `roles` field — RLS/`has_permission()` gates
  the destination page itself). Since productization wave 2 phase 13: New
  Rental is a pinned, visually dominant full-width CTA above a grid of 5
  secondary actions (Return Vehicle, Record Payment, Add Expense, Add
  Customer, Add Vehicle) that reorders by recent usage
  (`lib/quick-actions-recency.ts`, the same localStorage-only-preference
  pattern `InstallPrompt` established). See `docs/quick-actions.md`.
- **`WizardProgress`** (`components/domain/wizard-progress.tsx`) — dual
  rendering: a full step row with checkmarks at `sm:` and up, a compact
  segmented progress bar + "Step N of M" text below it. Shared by every
  multi-step flow (pickup/return wizards, the reservation form, customer
  onboarding).
- **`WizardFooter`** (`components/domain/wizard-footer.tsx`) — sticky
  Back/Continue bar with a pending spinner. What "Continue" actually does
  per step is decided by the parent; this only renders and wires the buttons.
- **`InstallPrompt`** (`components/pwa/install-prompt.tsx`) — captures
  Chromium's `beforeinstallprompt`; shows manual "Add to Home Screen"
  instructions on iOS (which never fires that event). Dismissal persisted in
  `localStorage` — this app's first use of client-side persistence.

## Approval-flow components (phase 17)

- **`ApprovalRow`** (`components/domain/approvals/approval-row.tsx`) — one
  pending/approved/rejected request card with Approve/Reject buttons (each
  wrapped in `SensitiveActionConfirmDialog`) when the viewer can review it.
- **`SensitiveActionConfirmDialog`** (`components/domain/shared/sensitive-action-confirm-dialog.tsx`) —
  the shared confirm-with-**required**-reason dialog for any sensitive
  operation (blacklisting a customer, refunding a deposit, resolving an
  approval request). Modeled on the pre-existing contract-cancel dialog,
  generalized so every sensitive action reuses one component. Built on
  Radix `AlertDialog` — focus trap and keyboard handling come for free.

```tsx
<SensitiveActionConfirmDialog
  trigger={<Button variant="outline" size="sm">Reject</Button>}
  title="Reject this request?"
  description="The requester will be notified with your reason."
  confirmLabel="Reject"
  onConfirm={(reason) => resolveApprovalRequest(request.id, "rejected", reason)}
/>
```

## Design token fixes made this phase

A systematic search (not spot-checking) for hardcoded hex colors, arbitrary
Tailwind values duplicating a real token, and inline `style` props for
color/spacing/font across every component from phases 02, 06-13, and 16-18
found the codebase already unusually consistent. Legitimate non-findings:
`signature-pad.tsx`'s one hardcoded hex is a `<canvas>` 2D-context stroke
color (Tailwind classes can't reach canvas drawing APIs); the handful of
`env(safe-area-inset-*)` inline styles in the mobile shell have no Tailwind
utility equivalent; `text-[10px]` is an established repo-wide micro-label
convention (used identically in `header.tsx`, `today-timeline.tsx`,
`member-row.tsx`), not sloppy drift.

Two real findings, fixed:

1. **`components/domain/approvals/approval-row.tsx`'s `StatusBadge()`** hand-rolled
   emerald/red/amber classes that exactly duplicated `toneClasses.positive/critical/warning.badge`
   — now imports and uses `lib/tone.ts` directly instead.
2. **`components/domain/contracts/contract-status-badge.tsx`'s `BADGE_CLASS`/`ICON` maps**
   duplicated the exact pattern `lib/status.ts` already centralizes for every
   other status enum, just never threaded through for `ContractStatus` — now
   a `contractStatusConfig` entry in `lib/status.ts`, same `{label, icon,
   dot, badge}` shape as `vehicleStatusConfig`.

Plus one minor shade alignment: `template-review-editor.tsx`'s one-off amber
info banner now uses `toneClasses.warning` directly instead of a
slightly-different hand-picked shade.

## AI copy tone consistency

The bible's standard (Chapter 5 §20): professional, concise, evidence-based,
never chatty. Auditing every AI-facing prompt in the codebase found
`lib/vehicle-recommendations.ts` and `lib/customer-summary.ts` already carry
an explicit guard — *"Plain business language, never chat-bot voice."* — in
both their prompt text and their schema field descriptions. That exact
phrase was added for consistency to `lib/ai/system-prompt.ts` (the main chat
assistant, which previously only said "keep responses short and practical" —
implicit terseness, no explicit anti-chattiness guard), `lib/operations-feed/pricing-ai.ts`,
and `lib/contracts/template-ai.ts`/`preview-ai.ts`.

**The one genuine tone-drift fix, found by this audit** (not AI-generated
copy itself — confirmed pure template strings — but the closest thing to it
in the reviewed set, and the most casually-phrased user-facing copy found
anywhere): `lib/mobile/inline-nudges.ts`'s two proactive nudges.

| Before | After |
|---|---|
| `"Don't forget: fuel gauge still needs a photo."` | `"Missing required photo: fuel gauge."` |
| `"This vehicle already has 2 damage records on file — worth a quick look before you start."` | `"This vehicle has 2 damage records on file. Review before starting the inspection."` |

Same information, no change to `lib/mobile/__tests__/inline-nudges.test.ts`'s
existing substring assertions (`"driver side"`, `"fuel gauge"`, `"N damage
record(s) on file"`) — just the surrounding phrasing brought in line with
the professional, evidence-based register used everywhere else.

## Accessibility

The newer intelligence/mobile/notification/approval surfaces were already in
reasonable shape: `EntityTimeline` uses semantic `<ol>/<li>`, the
notification bell already has `aria-label="Notifications"`,
`DocumentConfidenceRow`'s icon button already has a state-dependent
`aria-label`, `MobileBottomNav` already sets `aria-current="page"`, and every
status/priority signal is paired with a text label — never conveyed by color
alone. Interactive elements throughout are built on the shared `Button`
component and Radix primitives (`AlertDialog`, `Sheet`), which supply focus
rings and keyboard handling for free.

The one real, consistent gap found and fixed: purely decorative icons (the
priority icon in `InsightFeedItem`, the status icon in `ApprovalRow`'s
`StatusBadge`, the tone icon in `ScoreIndicator`/`ConfidenceIndicator`, and
the notification list/bell priority icons) had no `aria-hidden="true"` — a
screen reader could announce a meaningless icon glyph alongside text that
already conveys the same meaning. All now marked `aria-hidden="true"`.

## Cross-platform consistency

Verified via a real mock-mode browser pass (light + dark, desktop width and
the mobile shell) rather than a fix-heavy effort, given how little real
inconsistency the token audit above found: the same `toneClasses`/`lib/status.ts`
vocabulary renders identically across `DesktopShell` and `MobileShell`, and
role-specific views (phase 17's cleaner/mechanic/driver mobile homes) use the
identical `InsightFeedItem`/score/badge components as the owner/manager
desktop views — a user switching between them sees the same visual language,
not a different app.

## Final end-to-end walkthrough (acceptance criterion)

Driven live in the browser (mock mode), not just inferred from passing
tests, per this phase's own acceptance criterion:

- **Owner login → Command Center**: `/overview` renders the Morning
  Briefing, Needs Attention list (correct priority icons/colors), Revenue
  today/this month, Today's timeline, and the Fleet visual grid — all
  correctly. Business Pulse/Health Overview correctly render nothing
  rather than crashing, since they need live Supabase data this
  environment doesn't have. Zero console errors.
- **Returning-customer fast path**: `/customers/cus_2` → "Start rental"
  correctly lands on `/reservations/new?customerId=cus_2` with the
  customer pre-selected and the "Returning customer, fast path —
  licence and ID are on file and valid" banner shown, exactly as phase
  9 designed it.
- **Pickup inspection with AI damage check**: confirmed unreachable in
  mock mode — `startInspection` unconditionally calls `createClient()`
  in a mount effect, throwing before any UI renders. This is a
  pre-existing, already-documented limitation from phases 15-16 (not
  something this phase introduced or is in scope to fix), reconfirmed
  here rather than assumed.
- **Contract generation**: a **new finding** from this walkthrough —
  clicking "Generate contract" from a reservation navigates to
  `/reservations/[id]/contract-preview`, which crashes with an
  unhandled runtime error in mock mode (`requireSupabaseEnv()` thrown,
  uncaught) rather than degrading gracefully. This is a different, more
  abrupt failure than the same limitation on `/contract-templates`/
  `/contracts`, which phase 10 explicitly wrapped in `isSupabaseConfigured`
  + try/catch for a clean fallback — this specific route was evidently
  missed by that fix. Out of this phase's scope to fix (design
  tokens/component docs/AI tone/accessibility/AGENTS.md, not contract
  flow bugs), but flagged here rather than silently passed over,
  exactly what this final walkthrough exists to catch.
- **Mobile home as an employee role**: `/home` renders correctly in a
  real 390×844 mobile viewport (bottom tab bar, FAB, empty-state
  mission feed) for the current mock session. Mock mode is fixed to a
  single (owner) identity, so switching to a non-owner role's mission
  feed wasn't re-verified here — already covered by phase 17's own
  dedicated per-role browser pass (cleaner/mechanic/driver, documented
  in that phase's commits).

**Net result**: the roadmap's pieces genuinely work together as one
product for the paths this environment can exercise — the one real gap
found is narrow, pre-existing (not introduced by phases 17-20), and
named above rather than glossed over.
