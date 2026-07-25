# Multi-Channel Notification Platform Service

Roadmap phase 18. Extends the existing `notifications` table and
`lib/data.ts#getLiveAlerts`/`getNotificationFeed` — this was never a
from-scratch build. Three real gaps were found before writing any code:

1. **Stored one-off events were, in practice, unused.** The table's own
   design comment names two purposes — genuine one-off events (its own
   example: "a damage was just recorded") and live-alert dismissal
   markers — but the only code that ever inserted a stored event row was
   phase 17's brand-new approval-workflow RPCs, each doing its own raw
   `insert into notifications`.
2. **No notification carried an explicit action** — `href` alone,
   implicitly "open this," not the bible's required "Call customer. Send
   message. Open rental." format.
3. **Priority was its own 4-tier vocabulary** (`low|normal|high|urgent`)
   separate from the Operations Feed's `InsightPriority`
   (`critical|operational|important|informational`) — two taxonomies for
   the same concept.

## `notify()`: one write helper, both sides of the stack

`public.notify(company_id, user_id, type, title, description, link_href,
priority, key, actions)` (SQL, not `SECURITY DEFINER` — every caller is
already inside a `SECURITY DEFINER` function, same reasoning as
`log_activity()`) replaces the copy-pasted inserts in phase 17's
`create_approval_request()`/`resolve_approval_request()`.
`lib/notifications/service.ts#notify()` is the TypeScript-side
equivalent for application-layer callers (a background job, the AI chat
route) that can't call a SQL function directly — the same "one service
everything calls" framing as `lib/ai/service.ts#askAI()`. It dispatches
through a small channel adapter interface
(`lib/notifications/channels/`): `in_app` is real (a plain insert, the
same shape `notify()` writes); `email`/`whatsapp`/`sms`/`push` are
architected (`NotificationChannel.send()`) but honestly `configured:
false` — no email-sending package or third-party API key exists
anywhere in this repo, and choosing/paying for one is the owner's
decision, not something to force through unprompted. `notify()` skips an
unconfigured channel rather than throwing or faking delivery.

## One shared priority taxonomy

`notifications.priority` and `NotificationItem.priority` now reuse
`InsightPriority` directly (moved from
`components/domain/intelligence/insight-feed-item.tsx` to `lib/tone.ts`,
since it's shared vocabulary, not one component's concern — the
component re-exports the type so `operations-feed-list.tsx`'s existing
import kept working unchanged). A migration maps old values onto new
ones preserving relative severity: `urgent → critical`, `high →
operational`, `normal → important`, `low → informational`.

## Actions on every notification

`NotificationItem`/`LiveAlert` gained `actions: NotificationAction[]`
(`{ label, href, kind: "call" | "message" | "link" }`). Every
`getLiveAlerts` builder supplies real, contextual actions —
`lib/notifications/actions.ts#callAndOpenActions(phone, openLabel,
href)` is the shared shape for "call the customer (only if a real phone
number is on file — never a dead button) and open the record," reused
by every customer-facing alert type. Vehicle/document-only alerts
(maintenance, document expiry, damage) get a single "Open X" action —
one concrete action still satisfies the requirement; there's no second
real channel to invent for those. The two approval-workflow notification
types also carry a real "Review request"/"View request" action now,
closing the same gap for stored events.

## Self-resolving notifications

Live alerts already self-resolved before this phase (recomputed fresh
per request — no change needed, an important thing to note rather than
re-solve). Stored events did not: **`resolve_approval_request()` notified
the requester on a decision but left the original `approval_requested`
notifications sent to every manager/owner sitting there forever**, a
concrete bug found while auditing the only real stored-event code that
existed. Fixed by giving each of those notifications a
`key = 'approval_requested:<request_id>:<user_id>'` at creation time and
marking every matching row `read_at = now()` when the request is
resolved — the same "a stable key addresses one specific alert" idea the
table's own live-alert dismissal markers already use, applied to a
stored event instead.

## Aging

`lib/notifications/aging.ts#agePriority(priority, createdAt, now)` — a
single-step escalation (never a continuous curve) after a named,
documented threshold per tier (`informational`: 14 days, `important`: 7,
`operational`: 3; `critical` has nothing above it). Applied only to
unread items in `getNotificationFeed` — something already read isn't
"unresolved" anymore, so it doesn't age further.

## Permission-aware delivery

`lib/notifications/permission-filter.ts` names the two payment-shaped
alert types (`outstanding_balance`, `deposit_unresolved`) and filters
them out of `getNotificationFeed`'s result entirely for a session
lacking `view_financial_reports` (phase 17's `has_permission()`) — a
Cleaner/Mechanic session never receives them, the same "never see it,
not a redacted version" stance phase 17 took for the underlying tables.

## Notification Center ordering

`getNotificationFeed` now sorts priority-first (Critical, then
Operational, Important, Informational — recency only as a tie-breaker
within a tier), not purely by recency as before. This is what actually
makes the aging feature visible: an aged-up item genuinely moves toward
the top instead of just changing color in place. `NotificationList`'s
day-section grouping had to be adjusted to keep "Today"/"Yesterday"
headers in chronological order under this new sort — day sections are
explicitly ordered newest-first; each section's own items keep the
priority order they arrived in.

## Known limitations

- Only `in_app` delivery is real. Email/WhatsApp/SMS/push are
  structurally ready (the adapter interface is genuinely exercised —
  `notify()` correctly skips them) but need the owner to choose and pay
  for a real provider before any message actually sends anywhere but the
  in-app feed.
- `lib/notifications/channels/in-app.ts` uses the ordinary session-bound
  Supabase client, so it can only notify the *current* signed-in user
  (RLS: `user_id = auth.uid()`). A background job notifying someone
  else needs the service-role admin client (`lib/supabase/admin.ts`,
  established in phase 12) instead — not built here since no caller
  needs it yet.
- Same recurring limitation as every phase since 03: the live Supabase
  project has no migrations applied, so this phase's priority-taxonomy
  migration, `notify()`, and the RLS-adjacent `has_permission()` call
  were verified via `tsc`/`lint`/`test`/`build` plus a mock-mode browser
  pass, not against real Postgres.
