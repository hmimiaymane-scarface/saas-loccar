# Failure Registry

Productization wave 1 phase 8 — "Remove known broken paths before
redesign begins." Every page, workflow, or action known to crash,
display an unhandled error, hang, lose user input, or produce
misleading success feedback, as of this phase. Built from: (1) a
systematic audit of every server action's mock-mode behavior, (2) a
focused (not exhaustive) real browser pass across representative flows
for the failure modes the audit's pattern doesn't cover, and (3)
cross-referencing findings already on record from earlier phases.

No `app/**/error.tsx` or `app/global-error.tsx` existed anywhere before
this phase — every entry below whose resolution is "blocked with
graceful recovery" is caught by the two now added
(`app/(dashboard)/error.tsx`, `app/global-error.tsx`; see
`docs/security.md` for why one boundary can cover ~20 different files
at once — Next.js routes an uncaught Server Action error through the
same mechanism as a render error).

## Root cause behind nearly every crash in this registry

`lib/supabase/server.ts#createClient()` calls `requireSupabaseEnv()`
(`lib/env.ts`), which throws unconditionally whenever the app is in
mock mode. `lib/data.ts` itself is fully guarded — every one of its
~50 exported read functions short-circuits via `isMockMode()` first.
The crash is always specifically "a *mutation* path calls
`createClient()` directly with no mock-mode guard," never a read.

## Crashes on page load (Server Component render, no guard)

| Page | Root cause | Resolution |
|---|---|---|
| `/reservations/[id]/contract-preview` | `previewContractAction` calls `createClient()` unconditionally | **Fixed** — explicit `isSupabaseConfigured` check, clear "not available in demo mode" message |
| `/ai-assistant` | `listConversations()` calls `createClient()` unconditionally, before the page's own AI-provider "not configured" check | **Fixed** — same treatment, distinct from the AI-provider-key check |

Every other page that touches Supabase (`home`, `overview`,
`reservations/new`, `operations-feed`, `reservations/[id]`,
`customers/[id]`, `fleet/[id]`, `onboarding`, `contracts`,
`contracts/[id]`, `contract-templates`, `contract-templates/[id]`,
`contract-templates/[id]/versions/[versionId]`, `profile`) already
guards with `isSupabaseConfigured` + a `try/catch` → empty/null
fallback — checked, confirmed already graceful, not touched.

## Crashes on button-click (server action invoked from a form/onClick)

Every file below has `createClient()` called with no
`isMockMode()`/`isSupabaseConfigured` guard anywhere in the file, so
every exported mutation crashes the moment it's invoked. **Resolution
for all: blocked with graceful recovery** via `app/(dashboard)/error.tsx`
(verified directly — Team page's suspend button, a known crasher since
phase 3, now shows the boundary's "Not available in demo mode" card
with a working "Try again" instead of Next's raw error overlay).

Default-browsing entry points (an ordinary user hits these clicking an
ordinary button):

- `app/(dashboard)/fleet/actions.ts` — create/update vehicle
- `app/(dashboard)/reservations/actions.ts` — create/update/cancel/assign
- `app/(dashboard)/customers/actions.ts`
- `app/(dashboard)/payments/actions.ts`
- `app/(dashboard)/damages/actions.ts`
- `app/(dashboard)/maintenance/actions.ts`
- `app/(dashboard)/inspections/actions.ts`
- `app/(dashboard)/documents/actions.ts`
- `app/(dashboard)/expenses/actions.ts`
- `app/(dashboard)/notifications/actions.ts` — mark read/dismiss (see
  also the misleading-success finding below, same file)
- ~~`app/(dashboard)/search/actions.ts#globalSearchAction` — fires on
  typing in the header search box~~ **Fixed directly, productization
  wave 2 phase 14** (an `isSupabaseConfigured` guard returning `[]`,
  found while verifying that phase's own changes) — no longer relies on
  the boundary for this one.
- `app/(dashboard)/contract-templates/actions.ts` — every export except
  `previewContractAction` (listed above, worse severity)
- `app/(dashboard)/profile/actions.ts`
- `app/(dashboard)/operations-feed/actions.ts`
- `app/(dashboard)/settings/actions.ts`

Advanced/admin/rare flows (already-known precedent + same-pattern
siblings, lower real-world reach):

- `app/(dashboard)/employees/actions.ts` — already documented in
  `docs/freeze-checkpoint.md` item 12 (found phase 3)
- `app/(dashboard)/platform/actions.ts` — platform-admin only
- `app/(dashboard)/dev/document-extraction/actions.ts` — dev tool
- `app/(dashboard)/onboarding/actions.ts`
- `app/(dashboard)/invite/actions.ts`
- `app/(auth)/actions.ts` — sign-in/up/out; likely unreachable in
  default mock browsing since `getSessionContext()` auto-supplies the
  mock identity and there's no root redirect forcing the sign-in page

## Misleading success

| Location | Issue | Resolution |
|---|---|---|
| `components/domain/notifications/notification-list.tsx#markOne`/`markAll` | Set `isRead` optimistically, never checked the server action's `{error?}` result — a failed write (RLS denial, network blip in a real deployment; mock mode's crash is now caught one layer up by the error boundary first) silently left the UI claiming a critical alert was dismissed when nothing was persisted | **Fixed** — both handlers now revert the optimistic update and show the error inline on failure |

Checked, not found in this pass: the reservation-creation form
(`/reservations/new`) disables its submit button until required fields
are filled rather than showing a false success; typed "Internal notes"
text survived switching the customer-type toggle back and forth
(no lost input observed there).

## Hangs

None found. Two apparent hangs during this phase's own browser testing
(the reservations list and the notifications page, both showing a
stuck/unresponsive tab) were confirmed to be a **browser-automation
tooling artifact, not a real app hang** — in both cases a direct `curl`
to the same route responded in under 200ms while the tab appeared
stuck, and a fresh tab against the same URL loaded normally
immediately. Recorded here so this doesn't get miscounted as a fixed
issue in a future pass — it was never a real one.

## Lost input

None found in this pass's scope (see "Checked, not found" above). Not
exhaustively tested across every form in the app — a representative
sample only, per this phase's own scoping.

## Cross-referenced from earlier phases (not re-described here)

- `docs/freeze-checkpoint.md` item 12 — team-management mutations
  crash in mock mode (phase 3; same root cause as this registry's
  button-click section, `employees/actions.ts` specifically).
- `docs/freeze-checkpoint.md` items 13-14 — document upload is two
  separate steps (a broken upload can orphan a Storage object with no
  DB row), and no retry logic exists in the desktop upload form (phase
  7). Reliability gaps, not crashes — found but deliberately not fixed,
  a real architecture change out of proportion to a verification pass.

## Explicitly out of scope this phase

- Building real mock-mode support for contracts/AI-assistant data, or
  patching all ~20 button-click action files individually — the error
  boundary is the proportionate, DRY fix for the whole class; graceful
  degradation matches how every other "live-Supabase-only" feature in
  this app already behaves.
- An exhaustive click-through of literally every page/workflow for
  hang/lost-input/misleading-success — scoped to a representative
  sample, noted as such above rather than silently assumed complete.
