# Mobile Design System

Productization wave 1 phase 9 — "Define how the phone app should feel
before redesigning pages independently." Phase 16 (engineering roadmap)
built a genuinely distinct mobile product — its own shell, nav,
bottom-sheet quick actions, wizards, offline queue — but never wrote
down the rules those pieces followed. This is that reference. **No
individual mobile screen is redesigned by this phase** — that's later,
separate work this doc exists to make consistent, per the brief's own
framing.

Every rule below is grounded in a real file already in this codebase,
not invented fresh — where something genuinely didn't exist yet (a
touch-target size, motion-duration tokens, a bottom-sheet drag handle,
haptics), it was added as a small, real, minimal piece in this same
phase, referenced by name below.

## Spacing scale

Tailwind's default 4px-increment scale, unchanged — the "system" here
is which steps mobile screens actually use, consistently, not a new
scale:

| Use | Value | Where it's already used |
|---|---|---|
| Screen edge padding | `p-4` (16px) | `MobileShell`'s `<main>` (`components/layout/mobile-shell.tsx`) |
| Gap between cards/sections | `gap-4` (16px) | Same `<main>`; `MissionFeedList` |
| Gap inside a card (label/value rows) | `gap-1.5` / `gap-2` | `MemberRow`, mission-feed cards |
| Bottom safe-area clearance | `pb-24` | `MobileShell`'s `<main>` — clears the fixed bottom tab bar |

Don't introduce a one-off `p-3`/`p-5`/`gap-3.5` on a new mobile screen
without a specific reason — these four cover every real layout need
seen so far.

## Type hierarchy

Named roles, each a fixed Tailwind class combination already in use —
a lookup table, not new type-scale values:

| Role | Classes | Example |
|---|---|---|
| Screen title | `text-2xl font-semibold tracking-tight` | `SectionHeader`'s `<h1>` (`components/domain/section-header.tsx`) |
| Card/section title | `text-base font-medium` (heading font) | `CardTitle` (`components/ui/card.tsx`) |
| Body | `text-sm` | Most row/card text |
| Caption / meta | `text-xs text-muted-foreground` | Timestamps, secondary labels throughout |

## Card density

`Card` already has an unused `size="sm"` variant
(`components/ui/card.tsx`) — `--card-spacing: --spacing(4)` (16px)
instead of the default `--spacing(6)` (24px). **Mobile screens default
to `<Card size="sm">`, not the bare default.** Desktop keeps the
default density; this is a mobile-specific rule, not a global change.

## Touch-target minimums

**44×44px (Apple HIG)** for any interactive element inside the mobile
shell tree. Already true in practice for the mobile-specific surfaces
that exist today:

- `MobileBottomNav`'s tab links — full column width × `h-16` (64px tall).
- Its center FAB — `size-14` (56px).

`Button`'s shared icon-size variants (`icon-sm`=32px, `icon`=36px,
`icon-lg`=40px, `components/ui/button.tsx`) all fall short of 44px —
correct and unchanged for shared desktop-density contexts (mouse
precision doesn't need 44px). **New**: `size="icon-touch"` (`size-11`,
44px) — use this specifically for an icon-only button appearing inside
a mobile screen. Not a retrofit of every existing `icon-sm` usage
elsewhere in the app; those aren't mobile-context.

## Bottom-sheet patterns

`Sheet`/`SheetContent side="bottom"` (`components/ui/sheet.tsx`) is the
one pattern for: action pickers (`QuickActionsSheet`), filters, and
non-blocking supplementary content. **New**: `SheetContent` now renders
a drag-handle bar automatically for `side="bottom"` — the visual "swipe
down to dismiss" affordance that was missing (decorative only; Radix's
own escape/overlay-click/swipe handling was already there). Never use a
bottom sheet for primary navigation (that's a real route) or a
destructive confirmation (that's a modal, below).

## Modal rules

`AlertDialog` (via `SensitiveActionConfirmDialog`,
`components/domain/shared/sensitive-action-confirm-dialog.tsx`) is
reserved for destructive/irreversible confirmations only — its only
real use today. Never use it for a plain form or a picker; those
belong in a bottom sheet or a real page. A modal should always require
an explicit choice (confirm/cancel) — never used as a passive
information display.

## Form rules

- Single column on mobile — every existing `sm:grid-cols-2` form
  already collapses to one column below `sm:`; don't add a new form
  that fights this.
- Label above input, never a floating label.
- A multi-step flow gets a sticky bottom action bar
  (`WizardFooter`, `components/domain/wizard-footer.tsx`) with the
  primary action always in the same place — never top-of-screen on
  mobile.

## Loading states

The existing `<Loader2 className="animate-spin" />`-inside-the-button
convention (seen in `NewDocumentForm`, `InviteForm`, `MemberRow`, and
effectively everywhere else a mutation is pending) is the one loading
pattern: the control that triggered the action shows its own pending
spinner and disables itself. **No skeleton-loading component exists,
and none is needed today** — every page in this app is a Server
Component resolving its data before first paint, so there's no
client-side loading waterfall to skeleton. Revisit this if client-side
data fetching is ever introduced.

## Empty states

`EmptyPlaceholder` (`components/domain/empty-placeholder.tsx`) is
already the universal pattern — icon + title + one-line description,
deliberately no aggressive call-to-action. Use it for any mobile list
that can legitimately be empty; don't hand-roll a new empty message.

## Error states

Two real tiers, both already built:

1. **Page/action crashed outright** — `app/(dashboard)/error.tsx`
   (productization phase 8). The whole segment failed; show the
   boundary's recovery card, not a partial broken page.
2. **This specific action failed, the page is still fine** — inline
   `text-sm text-destructive` text next to the control that failed
   (every form in this app already does this). Use this whenever the
   surrounding page/data is still valid and only one action didn't go
   through.

Don't reach for tier 1 when tier 2 is enough — an inline message that
lets someone keep working is always better than losing the whole
screen.

## Success states

**Deliberate choice: no toast/snackbar system.** Confirmed by grep —
none exists anywhere in this app, and this phase doesn't introduce one.
The convention is an immediate, in-place UI change as the success
signal itself: an item updates in a list, a switch visibly flips, `router.refresh()`
brings the new state in. This matches the same "syncing later is
invisible infrastructure" philosophy phase 16's offline queue already
established (`docs/mobile.md`), and is arguably the *right* choice for
a one-handed field context — a transient toast is easy to miss while
walking around holding a phone in one hand. Don't introduce a
one-off toast for a new feature; make the state change itself visible
instead.

## Haptics

**New**: `lib/haptics.ts` — a tiny, feature-detected wrapper over the
Vibration API. Three named patterns: `"light"` (a toggle/confirmation
tap), `"success"`, `"warning"` (a short double-buzz). No-ops silently
where `"vibrate" in navigator` is false — same feature-detection
convention `components/pwa/install-prompt.tsx` already uses for
`beforeinstallprompt`.

**Honest limitation, stated plainly**: iOS Safari has never
implemented the Vibration API at all. This silently does nothing on a
large share of real devices — it's a nice-to-have confirmation on the
platforms that do support it (Android Chrome and most Android PWA
contexts), never something an interaction should depend on for
correctness or feedback a user actually needs to notice.

Wired into 3 real interactions so far, each firing on the tap itself
(never gated on the async action's eventual server confirmation —
consistent with "the tap deserves feedback regardless of what the
network does next"): notification mark-as-read/mark-all
(`components/domain/notifications/notification-list.tsx`), a Staff
access-switch flip (`components/domain/employees/member-row.tsx`), and
opening the mobile quick-actions sheet
(`components/layout/quick-actions-sheet.tsx`).

## Motion durations

**New**: named CSS custom properties in `app/globals.css`'s `@theme`
block — `--duration-fast` (150ms), `--duration-base` (200ms),
`--duration-slow` (300ms). Values match what's already in use, not new
numbers: `--duration-base`/`--duration-slow` mirror `SheetContent`'s
own existing open/close transition; `--duration-fast` is this app's
already-common hover/active-state feel (Tailwind's `transition-colors`
default). Reference these via `duration-[var(--duration-fast)]` etc. in
new mobile-facing code instead of a raw arbitrary duration.

| Tier | Value | Use |
|---|---|---|
| Fast | 150ms | Hover/active-state color changes, button press feedback |
| Base | 200ms | Sheet/dialog close, most UI transitions |
| Slow | 300ms | Sheet/dialog open, anything that should feel deliberate rather than snappy |

## Icon rules

- **lucide-react only** — already true across the entire app, no other
  icon library exists.
- Size per context: `size-4` (16px) inline/inside a button, `size-5`
  (20px) for nav icons (`BottomNavLink`), `size-6` (24px) for a
  prominent/FAB icon.
- **`aria-hidden="true"` on every purely decorative icon** — the rule
  `docs/component-library.md` established in phase 20 (audited and
  fixed there for `InsightFeedItem`, `ApprovalRow`, `ScoreIndicator`,
  etc.), restated here because it applies just as much to any new
  mobile icon: an icon next to text that already conveys the same
  meaning should never be separately announced by a screen reader.

## Status colors

`lib/tone.ts` (`Tone`/`toneClasses` — the 4-value
positive/warning/critical/neutral palette) and `lib/status.ts`
(per-enum status configs) are the system, full stop. **A new mobile
status/priority signal maps onto one of these four tones — never a new
hand-rolled color**, the same hard rule `docs/component-library.md`
already states for the app generally, restated here so a future mobile
phase doesn't quietly reintroduce a parallel color map the way two
components did before phase 20's audit caught it.

## One-handed interaction principles

- Primary destinations and the one elevated action (the FAB) live in
  the bottom thumb-reach zone — already true structurally in
  `MobileBottomNav`, not something to redesign around.
- Destructive or rare actions may sit higher up the screen, or require
  an extra tap to reveal (see `MemberRow`'s own "Access" disclosure
  pattern, `components/domain/employees/member-row.tsx`) — that
  friction is intentional, not an oversight to smooth over.
- Anything requiring a deliberate final commit (submitting a multi-step
  flow, confirming a destructive action) gets a sticky bottom bar
  (`WizardFooter`) rather than a button that could scroll out of thumb
  reach.
- Never place a screen's only primary action at the very top — a
  one-handed user holding the phone low can't comfortably reach it
  there.
