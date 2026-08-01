# Arabic / RTL Readiness Audit

Roadmap phase 56, seventh phase of Wave 8 ("Polish, Observability,
Security, and Launch Confidence"), directly after phase 55. Brief:
"avoid architectural problems that make Arabic expensive later" —
verify layout mirroring, directional icons, text alignment, tables,
forms, contracts, date presentation. "Full translation can remain
later. Done when: the system is structurally ready for RTL."

This is explicitly **not** a translation phase — no Arabic strings
were added, no language switcher was built, `dir` is not actually set
to `"rtl"` anywhere. The brief's own framing ("expensive later") is
about distinguishing genuine architectural blockers — things that are
costly to retrofit once the app has grown further — from things a
future find-and-replace pass could fix cheaply once real RTL work
starts. The audit and fixes below target exactly that distinction.

## Audit approach

A dedicated research pass quantified and located every physical-
direction pattern across all 7 verify areas before any fix landed —
counts, file:line references, and a judgment on each of the shared
UI primitives specifically, since fixing those once fixes every call
site for free (the actual leverage this phase is about), unlike
one-off page-level instances.

**Headline finding: the scope was genuinely small.** Low hundreds of
physical-direction class hits across ~40 files, not an app-wide
problem — because most spacing already uses flexbox `gap-*` (already
direction-agnostic) rather than manual margins. The real
architectural risk wasn't "thousands of classes to fix" — it was a
short list of specific things: zero logical-property adoption
anywhere (meaning the *pattern* wasn't established yet, even though
the *volume* was small), no `dir` mechanism at all, 9 duplicated
search-input implementations, and one genuine hard constraint in the
contract-PDF pipeline (see below).

## What was fixed

**`dir` mechanism** (`app/layout.tsx`) — added an explicit `dir="ltr"`
to the `<html>` element. There was no `dir` attribute at all before
(defaulting to `ltr` implicitly per the HTML spec) — making it
explicit turns a future locale-driven flip into a one-line conditional
instead of adding a wholly new attribute to a root layout with no
direction concept at all today.

**Logical properties on shared UI primitives** — converting these
once fixes every call site app-wide, unlike page-level edits:
- `button.tsx`/`badge.tsx`: `pr-`/`pl-` (already logically *named* via
  `data-[icon=inline-end/start]`, just applying physical utilities) →
  `pe-`/`ps-`.
- `sheet.tsx`: close button `right-4` → `end-4` (a close button's
  corner is a real, common RTL convention).
- `sidebar.tsx`: `border-r` → `border-e`.
- `header.tsx`/`mobile-shell.tsx`: `ml-auto` → `ms-auto`; header's
  search-button label `text-left` → `text-start`.
- `dropdown-menu.tsx`: checkbox/radio item padding and indicator
  position, the `inset` variant's padding, and the shortcut-hint/
  submenu-chevron margin all converted (7 separate spots in one
  shared file).
- `calendar-nav.tsx`: week-label `ml-1` → `ms-1` (caught while fixing
  this file's directional icons, below).
- `fleet-performance-table.tsx` / `import-wizard.tsx`'s CSV preview
  table (the only 2 real `<table>` elements in the app) — header/cell
  `text-left`/`text-right`/`pr-3` → `text-start`/`text-end`/`pe-3`.
  Column order itself is a flat data table in both, not a directional
  before/after sequence, so only alignment/gutter needed touching.
- `notification-bell.tsx`/`offline-queue-indicator.tsx`'s unread-count
  badges and `avatar.tsx`'s status-dot overlay — `right-*` → `end-*`.

**RTL-aware directional icons** — every `ChevronLeft`/`ChevronRight`/
`ArrowLeft`/`ArrowRight` usage in the app (8 total, confirmed by a
full-codebase search — no false positives, every one is a genuine
back/forward/prev-next/sequence icon) now flips under `rtl:` via
`-scale-x-100` (a horizontal mirror, not a rotation, so it can't
collide with an unrelated rotate-based state indicator elsewhere):
platform back-link, notification "View all," nav-list disclosure
chevron, dropdown submenu chevron, calendar prev/next week,
pagination prev/next, and the 3 pickup→return value arrows on the
inspection comparison page. None of this is visible today (`dir` is
hardcoded `"ltr"`) — the `rtl:` variant is inert until `dir="rtl"` is
actually set, which is exactly the "cheap now, expensive to retrofit
later" distinction the brief is about.

**Shared `SearchInput` component** (`components/domain/search-input.tsx`)
— 9 filter/search components each hand-duplicated an identical
"search icon inside an input" shell with physical `left-3`/`pl-9`
classes. This was the one spot in the audit where fixing a shared
primitive would **not** have fixed every call site for free, since no
shared component existed yet. New component (logical `start-3`/`ps-9`)
consolidates 8 of the 9; each caller keeps its own debounce timing /
URL-param logic, only the visual shell moved.
`company-filters.tsx` was uncontrolled (`defaultValue` + per-keystroke
`onChange`, no local state) — converted to controlled state to fit
the shared shell, identical fire-on-every-keystroke behavior either
way. `customer-search-combobox.tsx` (phase 51/54, with keyboard-nav
and ARIA wiring) needed `onKeyDown`/`role`/`aria-*` passthrough —
`SearchInput` was extended to forward arbitrary input props rather
than leaving this one caller out of the shared shell; its result-row
`text-left` was also fixed to `text-start`.
`contract-search-form.tsx` was deliberately **not** converted to the
shared component: it's a Server Component using a plain uncontrolled
`<form action>` with zero client JS — forcing it into a controlled
client component to fit `SearchInput`'s interface would be scope
creep for an RTL audit. Fixed its physical classes directly instead
(`left-3`/`pl-9` → `start-3`/`ps-9`), same visual result, no
architecture change.

## Deliberately not changed

- **`sheet.tsx`'s `side="left"`/`side="right"` variants** stayed
  physical. Confirmed by checking every real call site: all three
  (`customer-onboarding-wizard.tsx`, `quick-actions-sheet.tsx`,
  `new-rental-wizard.tsx`) pass `side="bottom"` — the left/right
  variants are dead code paths in practice today. More importantly,
  "which physical screen edge a drawer emerges from" is arguably a
  legitimate design choice independent of reading direction (many
  RTL-aware apps keep a navigation drawer on the visual side that
  matches thumb reach or existing user habit, not the logical
  reading-start edge) — this is a real judgment call, not an
  oversight, and left for whoever actually builds RTL support to
  decide with real design input rather than guessed at here.
- **Radix Popper's `data-[side=left]:slide-in-from-right-2` /
  `data-[side=right]:slide-in-from-left-2`** in `dropdown-menu.tsx` —
  `side` here is computed from available viewport space by Radix
  itself, not from text direction, so it's unrelated to RTL readiness
  despite superficially looking like a `left`/`right` pair.
- **Forms** (`reservation-form.tsx`, `onboarding-wizard.tsx`,
  `company-settings-form.tsx`) — audited and found already RTL-safe
  by construction: every field uses a stacked `flex flex-col` label-
  over-input layout with no fixed-width side-by-side label column and
  no alignment override on `Label` itself. Nothing to fix.
- **Contract PDF generation — the one genuine architectural
  constraint found in this audit, not a quick fix.** `lib/contracts/pdf-render.ts`
  uses `pdf-lib`'s low-level, fixed-coordinate `page.drawText()` API
  with `StandardFonts.Helvetica` (WinAnsi-encoded, Latin-only — no
  Arabic glyphs) and a hand-rolled word-by-word `wrapText()` with no
  bidi/shaping awareness. This is a deliberate architectural choice
  (`docs/contracts.md`: "a clean, simple, single-column A4 document...
  no native binaries/Chromium," i.e. explicitly not an HTML-render-to-
  PDF pipeline that would inherit `dir`/font-shaping from a browser
  engine for free). Adding real Arabic contract text later would need
  either an Arabic-glyph font plus a bidi/shaping layer bolted onto
  `pdf-lib`'s drawing API, or swapping the whole rendering approach —
  neither is a small patch to the current file. This is exactly the
  "expensive later" risk the brief warns about, and the correct,
  proportionate response in an audit phase is to document it clearly
  for whoever eventually does that work, not to attempt a from-scratch
  bidi-aware PDF pipeline here.
- **Date/number-formatting locale inconsistency** — found, but
  deliberately only documented, not fixed: `lib/format.ts` hardcodes
  `"en-GB"`/`"fr-MA"` across its 4 formatters, `lib/reports.ts`
  separately hardcodes `"en-US"`, `lib/data.ts`/`lib/needs-attention.ts`
  each duplicate an inline `toLocaleDateString("en-GB", ...)` instead
  of calling the shared helpers, and `lib/contracts/context.ts`'s
  contract-date formatter bypasses `Intl` entirely with a hand-rolled
  English `MONTHS` array (deliberately, per its own comment, for test
  determinism) plus its own separate `"en-US"` for money. None of
  these functions accept a locale parameter today — unlike this app's
  own correctly-parameterized timezone handling
  (`session.company.timezone` threaded through every call site).
  Adding a `locale` parameter now, with no real second locale to pass
  it, would be speculative plumbing this codebase's own conventions
  argue against (no half-finished abstractions ahead of an actual
  need). Documented here as a real, findable gap for whenever a
  `company.language`-style field actually exists to drive it — and
  the *existing* inconsistency (3 different hardcoded locale strings
  across formatters that all format the same MAD currency) is worth
  fixing on its own merits regardless of Arabic, just not inside this
  phase's stated scope.
- **No `company.language`/locale field was added.** Per the brief's
  own "full translation can remain later," and matching phase 54's
  finding that zero i18n infrastructure exists anywhere in this app —
  building the data model for a feature with no consumer yet would be
  exactly the kind of speculative future-proofing this project's own
  conventions warn against.

## Verification

tsc/eslint/757 tests/build clean at every checkpoint. Live mock-mode
browser check confirmed no visual regressions on pages touched by
this phase (Fleet, Reservations, Customers, Documents, Payments,
Expenses, Reports, the platform companies list, notifications) —
expected, since every fix here is either inert until `dir="rtl"` is
set (the `rtl:` icon flips) or a physical→logical utility swap that
renders identically under the app's current `dir="ltr"` default.
Additionally forced `document.documentElement.dir = "rtl"` live in
the browser to directly observe the fixes actually mirror correctly
once RTL is engaged — the one meaningful way to verify a CSS logical-
property change actually does what it claims, since the default `ltr`
state alone can't distinguish "still physical" from "logical but
currently pointing the same direction." Confirmed on `/reports`: the
whole page mirrored (sidebar to the right, search/notifications to
the left, the fleet-performance table's numeric columns swapped to
the visual left with vehicle names on the right, the two summary
cards below it reordered) with zero code specifically written for
any of that beyond the phase's own logical-property swaps — flexbox
`gap-*` layouts and the browser's own bidi handling did the rest for
free. Confirmed on `/fleet`: `SearchInput`'s icon correctly moved to
the right edge of the input (the reading-start side in RTL, zoomed
screenshot). Confirmed on the notification bell dropdown: "View all"
renders with its arrow visually pointing left (`←`) under `dir="rtl"`
— the `rtl:-scale-x-100` flip firing exactly as intended.
