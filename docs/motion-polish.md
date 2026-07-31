# Motion and Interaction Polish

Roadmap phase 52, second phase of Wave 8 ("Polish, Observability,
Security, and Launch Confidence"), directly after phase 51's UI
Consistency Audit. Brief: use motion for sheet transitions, step
completion, success confirmation, card expansion, state changes, and
quick-action opening — "motion makes actions clearer and
faster-feeling." Avoid slow animation, decorative motion during
repetitive work, and futuristic effects.

Same audit-then-fix approach as phase 51: a dedicated research pass
across all 6 named categories first, so the fix pass only touches real
gaps rather than adding motion for its own sake.

## Infrastructure already in place

`tw-animate-css` (the Tailwind v4-compatible `tailwindcss-animate`
fork) is already a dependency, imported in `app/globals.css`, providing
the `animate-in`/`animate-out`, `fade-in`/`fade-out`, `zoom-in`/
`zoom-out`, `slide-in-from-*` utilities and the `data-open`/
`data-closed` Radix-state variants used throughout `components/ui/*`.
Named duration tokens (`--duration-fast: 150ms`, `--duration-base:
200ms`, `--duration-slow: 300ms`) were already defined, mirroring
Sheet's own durations — this phase's new classes match those tokens
rather than inventing new arbitrary durations. The `motion` package
(framer-motion's successor) is also a dependency, used in exactly 3
places (an animated counter, a staggered fleet-tile grid, an SVG
progress ring) — none overlapping this phase's 6 categories, so it
wasn't reached for here; every fix in this phase is a plain Tailwind
transition/animation class, no new JS animation code.

## What audited clean already

- **Sheet transitions** (`components/ui/sheet.tsx`) — full slide + fade
  already, 200/300ms, the reference the duration tokens were named
  after.
- **Quick-action opening** — `Sheet`, `DropdownMenu`, `Popover`,
  `Tooltip`, `AlertDialog`, and the command palette's raw
  `DialogPrimitive` all already share the same fade+zoom-95 recipe with
  `data-open`/`data-closed` variants. The quick-actions FAB itself
  already has a tap-press `active:scale-95`.
- **State changes** — `Switch` (track + thumb), `Badge`, `Button`, and
  `Progress`'s fill all already carry `transition-colors`/
  `transition-all`/`transition-transform`.

## What was fixed

**Step completion** — `WizardProgress`'s step circles, connector
lines, and mobile progress segments had no transition class at all;
completing a step was a hard color snap, and the checkmark replacing
the step number was an instant swap. Added `transition-colors` to all
three, and a scale+fade mount animation to the checkmark. The
connector line between two completed steps now also fills to
`bg-primary` (previously stayed neutral `bg-border` even between two
done steps) — a small, deliberate state-change fix riding along on the
same edit.

Every wizard's step *content* was a plain `{step === N && ...}`
conditional mount/unmount — content just disappeared and the next
step's content appeared in the same frame, across all 6 wizards
(onboarding, customer onboarding, import, new-rental, return, pickup).
Each now fades in on arrival (`key={step}` + `animate-in fade-in-0
duration-200` on the step-content wrapper). Deliberately just a fade,
no slide — a directional slide reads naturally for swipeable/paged UI,
but these wizards navigate via a fixed Back/Continue footer, not swipe
gestures, so a slide would imply an affordance that isn't there.

One documented exception: `new-rental-wizard.tsx`'s step-1 block is
kept permanently mounted on purpose (phase 19) with visibility toggled
via a `hidden` class, specifically so a Step 1 → 0 → 1 round trip never
discards the customer/dates/vehicle draft already typed in. Keying that
block by `step` would remount it and silently lose that state — left
untouched; steps 0, 2, 3, and 4 in that same wizard got the normal
per-block treatment instead of the wrapper-level one every other wizard
uses, specifically to avoid touching that block.

**Success confirmation** — no toast/notification library exists
anywhere in this codebase (confirmed by a full-repo grep), so success
feedback is expressed entirely through inline UI state; building a
toast system was not part of this phase's brief and would be a large,
separate addition, not a polish pass. `SubmitButton`'s "saved" checkmark
(the app's actual save-confirmation primitive, phase 40) swapped in
instantly — now scales/fades in, matching the wizard-progress
checkmark treatment. `RentalStartedBanner` and `ReturnCompletedBanner`
(the two genuine one-time success moments, each gated by a
`justActivated`/`justCompleted` query param) now fade+slide in instead
of snapping into place.

`OfflineStatusBanner` was deliberately left alone: unlike the two
banners above, it can appear and disappear repeatedly during active
field work as connectivity flips and sync counts change — animating
every one of those appearances would be exactly the "decorative motion
during repetitive work" the brief says to avoid, not a real success
moment.

**Card expansion** — new `components/ui/collapsible.tsx`, a CSS-only
expand/collapse using `grid-template-rows: 0fr`/`1fr` (not Radix's
`Collapsible`, which needs a measured `--radix-collapsible-content-height`
off a mounted node and fights content that changes height while open,
e.g. a form with conditional fields). `inert` + `aria-hidden` on the
collapsed state, since the content now stays mounted (for the
transition to have something to animate) instead of being torn down —
without `inert`, a collapsed panel's own inputs/switches would still
be keyboard-focusable, a real regression from the previous fully-
unmounted behavior.

Swapped onto `member-row.tsx`'s staff-access panel (the only
chevron-driven expand in the app; the chevron itself already rotated,
but the revealed panel beneath it was a hard snap) and
`contract-amendment-section.tsx`'s inline "add amendment" form. Both
were safe drop-in swaps since the revealed content's own state already
lived in the parent component, not inside the conditional block.

`branches-section.tsx`'s `EditBranchRow`/`AddBranchForm` are a
different shape — a full view↔form content swap, not extra content
revealed beneath a persistent header — so `Collapsible` doesn't fit.
Gave both the same fade-in-on-mount treatment already used for wizard
step content instead, for the same reason: it's a full swap, not a
reveal.

**State changes** — `components/domain/status-badge.tsx`'s
`StatusBadge`/`StatusDot` (the actual status-pill component every
domain status config renders through) had no transition class at all,
unlike `components/ui/badge.tsx`'s own `badgeVariants`. Any live
client-side status change (e.g. a customer or reservation status
update) would have hard-snapped its color. Added `transition-colors`
to both. `Checkbox`'s border/accent color now also transitions; its
native check-mark render can't itself be animated without replacing it
with a custom SVG-based component — a bigger change than a motion-
polish pass calls for, documented as a known constraint rather than
fixed.

## Verification

tsc/eslint/755 tests/build clean at every checkpoint. Live mock-mode
browser check across light and dark: wizard step-to-step fade
(onboarding and new-rental wizards), the staff-access panel's smooth
expand/collapse on `/employees`, the status-badge color transition on
a customer status change, and the checkmark/connector-fill motion on
`WizardProgress`. `SubmitButton`'s "saved" state and any server-action
success path could not be exercised live — this repo's own established
mock-mode limitation (every mutating server action throws inside
`createClient()` before returning, so a mutation's success path is
never reachable in mock mode, only its pre-mutation UI) — reviewed by
reading the component's render logic instead.

**New environment gotcha found this phase, worth remembering for any
future live-browser verification pass on this app**: this is a PWA
with an active service worker (`sw.js`) caching static asset chunks
(`rentalos-static-v1`) by URL. Turbopack dev mode reuses stable
(non-content-hashed) chunk filenames for hot reload, so once a service
worker has cached a CSS chunk under a given URL, it keeps serving that
*exact stale byte content* for that URL on every later page load —
even a hard navigation, even `fetch(url, {cache:'no-store'})` from the
page — because the service worker intercepts the request before the
browser's own cache/network layer is ever consulted. This silently
masked EVERY class added in checkpoints 1-4 for a long stretch of this
phase's live verification (grid-rows-based collapse computed as if the
utility didn't exist, checkmarks/badges never visibly changed) even
though tsc/eslint/build all passed and the compiled CSS on disk was
provably correct the whole time. Root-caused by comparing a `curl` of
the chunk URL (always fresh, no service worker involved) against the
same URL fetched from inside the page (stale) — they differed. Fixed
by `navigator.serviceWorker.getRegistrations()` → `unregister()` on
each, plus `caches.keys()` → `caches.delete()` on each, then a normal
reload. Any future session doing live browser verification on this app
should do this once at the start if UI changes don't seem to be taking
effect, before suspecting the code itself.
