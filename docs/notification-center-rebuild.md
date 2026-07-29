# Notification Center Rebuild

Wave 4 phase 35. Brief: 5 rules — every notification has a useful
action; duplicates collapse; resolved alerts disappear; old unresolved
alerts escalate; informational noise stays out of the main feed. "Done
when: owners trust notifications instead of ignoring them."

## Not a rebuild — phase 18 already built most of this

Phase 18 ("Multi-Channel Notification Platform Service") built the real
infrastructure this phase's brief describes. Re-checked each rule
against the actual code rather than assuming a rewrite was needed:

- **Rule 1 (useful action) — already true.** Every `getLiveAlerts`
  builder returns real `actions` (phase 18). Both real SQL callers of
  `public.notify()` (`create_approval_request`/`resolve_approval_request`)
  pass a genuine action ("Review request"/"View request"). Confirmed by
  reading every insert site.
- **Rule 3 (resolved alerts disappear) — already true.** Live alerts
  are recomputed fresh on every request — there's no stored "alert" row
  to clean up; they simply stop generating once the condition clears.
  The one stored-event case that needed a resolution fix (approval
  notifications never marked read once resolved) was already fixed in
  phase 18.
- **Rule 4 (old alerts escalate) — already true.** `agePriority`
  (`lib/notifications/aging.ts`) does exactly this, already wired into
  `getNotificationFeed`.

## What was actually built this phase

**Rule 2 (duplicates collapse) — a structural guarantee, not a bug
fix.** No currently-reproducible duplicate exists: the two real SQL
`notify()` callers are each keyed to a unique approval-request id, and
the TS-side `notify()` (`lib/notifications/service.ts`) has zero
callers anywhere in the app today. But nothing stopped a *future*
caller from creating a real duplicate either — genuine one-off event
rows (`key IS NULL`) have no uniqueness constraint at the database
level at all. `collapseDuplicateNotifications`
(`lib/notifications/dedupe.ts`, new) closes that gap structurally:
groups by `(type, href)`, keeps whichever instance is most recent, wired
into `getNotificationFeed` right before aging/sorting. Items with no
`href` are never collapsed against each other just for both being null.

**Rule 5 (informational noise stays out of the main feed) — a real,
confirmed gap, now fixed.** `NotificationList` used to render every
priority tier interleaved in one day-grouped list; the bell dropdown
(`components/layout/notification-bell.tsx`) could show an informational
item in its 6-slot preview whenever fewer than 6 higher-priority items
existed. Fixed with the same "kept out of the primary view, never
deleted" principle phase 13 already applied to the Overview page's
operations-feed items:
- `NotificationBell` filters informational items out entirely before
  slicing to the preview count.
- `NotificationList` splits into an `attention` list (critical/
  operational/important, rendered exactly as before — day-grouped) and
  a collapsed `<details>` disclosure below it, "Informational (N)" —
  still fully reachable, just never competing for attention with
  everything else.
- `getNotificationFeed`'s return shape and `unreadCount` are unchanged —
  the split is purely how the UI renders what's already there.

A `NotificationRow` component was extracted from the previously-inlined
row JSX so the main list and the informational disclosure render rows
identically, never drifting apart in what a notification actually looks
like.

## Set aside, stated honestly

3 of the 12 `notifications.type` values (`damage_recorded`,
`inspection_draft_unfinished`, `vehicle_unavailable_upcoming_reservation`)
are defined in the schema/`NotificationType` TS union but have **zero
real insert call sites anywhere** — confirmed by grepping every
migration for an actual insert, not just the CHECK constraint listing
them. Wiring these up would be building new notification-producing
features, not fixing the 5 stated rules — out of scope for this phase,
not silently left unmentioned.

## Known limitations (intentional)

- **Real live mock-mode verification, materially better than phase 34's
  operations-feed work**: `getNotificationFeed`'s live-alert half
  (`getLiveAlerts`) has full mock-mode support. Confirmed on
  `/notifications` and the bell dropdown: real mock alerts render with
  working actions, priority badges, day grouping, zero console errors,
  both light and dark mode. The informational disclosure correctly
  never appeared — traced this to `URGENCY_TO_PRIORITY`'s own mapping
  (`due_soon`→important, `due_now`→operational, `overdue`→critical: no
  live-alert urgency ever produces `informational`), not a bug — informational-tier
  notifications can only come from stored event rows, which have zero
  mock data. Correctness of that code path rests on the component logic
  itself (a plain array filter) and `tsc`/lint/build.
- **The stored-event half of `getNotificationFeed`** (`getStoredNotificationEvents`,
  `getDismissedAlertKeys`) returns empty in mock mode, same as every
  phase touching this table — not something this phase changes.
