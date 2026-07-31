# Accessibility and Touch Audit

Roadmap phase 54, fourth phase of Wave 8 ("Polish, Observability,
Security, and Launch Confidence"), directly after phase 53 (Empty-
State and First-Week Experience). Brief: "make the product comfortable
under real working conditions" — touch target sizes, contrast, outdoor
readability, keyboard behavior, screen zoom, long names, French text
expansion, one-handed reach, destructive action safety. "Done when:
the UI remains usable when the owner is standing beside a car, not at
a desk."

Same audit-then-fix approach as phases 51-53: a dedicated research
pass across all 9 checklist items first (with real WCAG contrast
ratios computed, not eyeballed), so the fix pass only touches
confirmed gaps.

## 1. Touch target sizes

`components/ui/button.tsx`'s `icon-touch` size variant (44×44px, Apple
HIG minimum) was added back in phase 9 specifically for icon-only
buttons inside the mobile shell tree — but had exactly zero real call
sites; every mobile-shell icon button still used `size="icon"` (36px).
Swapped it onto the three genuine mobile-only targets found: the
`MobileShell` search button, `OfflineQueueIndicator` (only ever
rendered inside `MobileShell`), and `PickupWizard`'s "Call customer"
button — the literal field-work screen the brief describes.

`Header`'s own `sm:hidden` mobile search button was deliberately **not**
touched: `DesktopShell` (its only render site) is itself `hidden
lg:flex`, so that `sm:hidden` branch can never actually render below
1024px regardless of its own 640px breakpoint — dead code, not a live
touch-target gap. Worth a future cleanup pass, not an accessibility fix.

`icon-sm` (32px) elsewhere (member-row, invitation-row, calendar-nav,
notification list, AI conversation sidebar, etc.) stays as-is per the
size variant's own existing doc comment in `button.tsx` — those are
shared desktop-density contexts, not mobile-shell screens. `MobileBottomNav`'s
FAB (56px) and tab links (64px tall), and `SegmentedSelector`'s
`min-h-11` (44px) options, already meet the target correctly — the
pattern works when applied, it just wasn't applied everywhere it
should have been.

## 2. Contrast

Computed real WCAG relative-luminance ratios (not eyeballed) for every
token pair in `app/globals.css` and every status-badge color family in
`lib/status.ts`. **Everything passes AA (4.5:1) comfortably** — the
worst text pairing (`--muted-foreground` on `--background`, light
mode) is 4.73:1; every status-badge pairing (emerald/amber/red/zinc/
blue/violet/orange) ranges 4.84:1 to 7.63:1. `--border` on
`--background` is only 1.26:1, well under the 3:1 non-text minimum,
but that token is used for dividers/card borders, not text or a
required-to-perceive boundary — a minor/borderline item, not a real
failure. `StatusBadge`/`StatusDot` already render icon+label+color
together, confirmed directly in the component — color is never the
only signal. **No changes needed; this is a genuine strength.**

## 3. Outdoor readability

No `prefers-contrast` media query or high-contrast mode exists
anywhere (confirmed by full-repo grep) — this is a real, but large,
gap that would need its own dedicated palette design, not a quick fix
within an audit phase. The one concrete, quick win: `photo-upload-grid.tsx`'s
required-photo-slot labels — the literal "aim your phone at the
fender" screen used by both wizards' Photos step — rendered at 11px
(slot name) and 10px ("Required") over a camera-icon tile. Bumped to
12px/11px; the aspect-square tiles have ample room so this doesn't
affect layout. Broader `text-[10px]`/`text-xs` usage elsewhere
(nav labels, calendar day labels, caption/meta text) matches this
app's own documented "Caption/meta" role (`docs/mobile-design-system.md`)
and wasn't touched — not a one-off regression, a consistent, if small,
design-system size.

## 4. Keyboard behavior

Modals (`Sheet`, `AlertDialog`) are genuine Radix primitives — focus
trap, Escape, and focus-return are supplied for free, confirmed by
import rather than assumed. The only custom `onKeyDown` in the app
(`CommandPalette`'s global Cmd/Ctrl+K listener) is benign.

**Real gap, fixed**: `CommandPalette` and `CustomerSearchCombobox` were
both mouse/touch-only for result selection — a real text input with a
results list underneath, but no arrow-key navigation and no
`listbox`/`option` ARIA roles, forcing a keyboard user to Tab through
every result one at a time. Both now support ArrowDown/ArrowUp to move
a highlighted index and Enter to select it, with `role="combobox"`/
`"listbox"`/`"option"` and `aria-activedescendant` so assistive tech
announces the current selection; the active option also gets a
visual highlight matching its hover state, and `CommandPalette`'s list
scrolls the active option into view.

## 5. Screen zoom

`app/layout.tsx`'s `Viewport` export sets only `themeColor` and
`viewportFit` — no `maximumScale`/`userScalable` anywhere in the app
(confirmed by grep, including `app/manifest.ts`). Next.js's default
viewport (`width=device-width, initial-scale=1`) applies with no scale
lock. **Pinch-zoom is not broken anywhere in this app — a clean pass,
nothing to fix.**

## 6. Long names

Most list-item components already establish `min-w-0 flex-1` +
`truncate` consistently (customer-list-item, document-list-item,
command-palette results, calendar tiles, mobile nav labels). Two real
exceptions, fixed: `member-row.tsx`'s name/subtitle and
`invitation-row.tsx`'s email had no `truncate` and no `min-w-0`
anywhere in their ancestor chain — a long name could push or squeeze
the role selector and action buttons instead of truncating cleanly.
Added the same `min-w-0 flex-1` (name side) / `shrink-0` (actions
side) pattern already established everywhere else.

## 7. French text expansion

**No i18n infrastructure exists at all** — confirmed by grep for
`next-intl`/`i18n`/`react-intl`/`translations`/`locales` (zero
matches anywhere), every UI string is a hardcoded English literal, and
`app/layout.tsx` hardcodes `lang="en"`. Building real i18n is a large,
separate undertaking — its own dedicated phase, not something this
audit pass attempts. What this phase *did* fix: `member-row.tsx`'s
role `<select>` had a hard `w-36` (144px) — safe for today's short
English labels ("Owner"/"Staff") but a longer label (French
"Propriétaire") would clip inside a fixed-width native select, unlike
every free-width button/label elsewhere in the app. Switched to
`min-w-36 w-auto` so it keeps its current minimum size but can grow.
Every button variant already carries `whitespace-nowrap` with no fixed
width constraint (confirmed by reading `buttonVariants`), so longer
labels elsewhere just widen the button rather than clip — no other
fixed-width text container was found.

## 8. One-handed reach

`MobileBottomNav` (bottom-fixed nav + elevated FAB) and
`WizardFooter` (sticky bottom Back/Continue bar) are both already a
deliberate, documented one-handed-reach design.

**Real, concrete violation of `WizardFooter`'s own documented rule
("never top-of-screen on mobile"), on the single most consequential
step of each wizard**: `PickupWizard`'s "Activate rental" and
`ReturnWizard`'s "Complete rental" — literally the button that rents
the car out / completes the rental — were both inline at the bottom of
a long scrolling step-4 card, with the sticky footer's continue button
hidden on that exact step. Both now wire step 4's primary action
through `WizardFooter`'s existing `onContinue`/`continueLabel`/
`continuePending`/`continueDisabled` props instead, matching every
other step in both wizards. The override-reason textarea and summary
rows stay in the card (review content, not actions) — only the submit
button moved.

`new-rental-wizard.tsx`'s step 4 (Contract) was deliberately **not**
touched: it has up to three distinct sequential actions (generate
contract, record signature, start rental) depending on state, not one
buried primary action, so it doesn't fit `WizardFooter`'s single-slot
shape — a genuinely different UI problem, not the same violation.

## 9. Destructive action safety

Phase 51 already added a confirm step to 5 previously-unconfirmed
destructive actions. This phase's gap: `member-row.tsx`'s suspend/
reactivate button sat directly beside its remove/delete button, and
`invitation-row.tsx`'s "Copy link" sat directly beside its revoke
button — both pairs only the row's own `gap-2` (8px) apart, a real
one-handed/distracted mis-tap risk (a mis-tap doesn't instantly
destroy anything thanks to phase 51's confirm step, but the *wrong*
confirmation opening is still one 8px margin away). Added a
`border-l` + `pl-2` + `ml-1` separator before each destructive action
— both a visual cue and a real spatial gap wider than the row's own
uniform spacing, without restructuring either row.

## Verification

tsc/eslint/757 tests/build clean at every checkpoint. Live mock-mode
browser check confirmed: `icon-touch` renders at the correct larger
size on `MobileShell`'s search button and `PickupWizard`'s call
button; the photo-grid label size bump doesn't break the tile layout;
`CommandPalette` and `CustomerSearchCombobox`'s arrow-key navigation
and Enter-to-select both work correctly; `member-row.tsx`'s long-name
truncation and destructive-action spacing render as intended; and —
the one behavioral (not just visual) change this phase made —
`PickupWizard`'s and `ReturnWizard`'s step-4 "Activate rental"/
"Complete rental" buttons correctly appear in the sticky footer and
still fire the same activation/completion logic as before, verified
by stepping through both wizards to step 4 in the browser.
