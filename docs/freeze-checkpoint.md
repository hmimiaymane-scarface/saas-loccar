# Freeze checkpoint — pre-productization

Roadmap: RentalOS Productization Roadmap, Wave 1, Phase 1 ("Freeze the
Current Build"). This is the checkpoint before any productization work
begins — a decompressed record of exactly what state the engineering
roadmap ended in, so nothing that follows can accidentally destroy it.

## The frozen point

- **Tag**: `v1.0-roadmap-complete`, on `master`, commit `3a2ca86`
  ("Phase 20 checkpoint 5: final verification + end-to-end walkthrough" —
  the last commit of the 20-phase engineering roadmap).
- **Branch**: `productization`, created from that same commit. All
  productization-wave work happens here, never on `master` directly.
  `master` stays exactly as-is — the restore point if anything needs to
  be reverted to.
- To restore to this exact point at any time: `git checkout v1.0-roadmap-complete`
  or `git reset --hard v1.0-roadmap-complete` on a throwaway branch.

## Verified state at freeze (re-run fresh, not carried over from memory)

- `npx tsc --noEmit` — clean, zero errors.
- `npm run lint` (eslint) — clean, zero errors.
- `npm run test` (vitest) — **524 tests passing across 52 test files**,
  zero failures.
- `npm run build` — clean, **75 routes** compiled successfully.
- `git status` — working tree clean, `master` up to date with
  `origin/master` on GitHub (`hmimiaymane-scarface/saas-loccar`).
- **62 SQL migrations** exist in `supabase/migrations/`, spanning phases
  01-19 of the engineering roadmap.
- Runtime: Node v24.18.0, npm 11.16.0, Next.js 16.2.10 (Turbopack).

## Required environment variables / services

From `.env.example` (the authoritative list — kept in sync with
`lib/env.ts`'s centralized env access):

| Variable | Required? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | For live mode | Supabase project URL. Public by Supabase's own design — RLS is the real access control, not hiding this. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For live mode | Supabase anon key. Same public-by-design note as above. |
| `SUPABASE_SERVICE_ROLE_KEY` | For 2 specific call sites only | Bypasses RLS entirely. Used ONLY by `lib/supabase/admin.ts` — the Operations Feed cron job (phase 12) and WebAuthn `authenticate-verify` (phase 16). No other code path should ever import it. |
| `NEXT_PUBLIC_USE_MOCK_DATA` | Optional | Forces mock/demo data even with real Supabase credentials present. |
| `OPENAI_API_KEY` | One of these two, for AI features | AI Assistant chat + every `askAI()` structured-output call. |
| `ANTHROPIC_API_KEY` | One of these two, for AI features | Same as above — the provider picker in the UI only offers whichever key is actually set. |
| `CRON_SECRET` | For the Operations Feed job | Authenticates Vercel's own scheduled requests to `app/api/cron/*`. |

**Neither Supabase variable is currently set in this environment.** The
app has been built and verified entirely in mock mode — see "Known
unverified" below, this is the single most important fact for whoever
picks up productization work.

No other third-party service is wired up: no email/SMS/WhatsApp/push
provider, no error-tracking service, no analytics. All architected for
(the notification channel adapter interface, phase 18) but none
configured.

## Known working (verified against mock data, real browser passes)

- Full CRUD across fleet, reservations, customers, payments, expenses,
  maintenance, employees.
- Document upload + AI OCR extraction, versioning, expiry monitoring,
  duplicate/consistency checks, server-side upload validation.
- Vehicle and Customer Intelligence scoring, Command Center pages.
- Dynamic contract template engine, generation, signature flow,
  lifecycle, amendments (except see gap below).
- AI Operations Feed observers (pure logic, unit-tested; the live cron
  execution itself has not run against a real database).
- The 7-role permission engine (`has_permission()`), RLS enforcement,
  sensitive-operation confirm-with-reason flows, generic approval
  workflow.
- Notification service (in-app channel only), aging, permission-aware
  filtering.
- Mobile PWA shell, offline-tolerant mid-flow queueing, WebAuthn
  passkey flow with rate-limiting (structurally verified; see gap
  below for what a desktop browser pass can't confirm).
- Design-token consistency, component library documentation,
  accessibility pass on decorative icons (`docs/component-library.md`).

## Known unverified / open gaps (carried forward, not fixed by this freeze)

1. **Nothing has ever run against a live Postgres database.** All 62
   migrations exist only as files — never applied to any real Supabase
   project. This is the top item for whoever starts productization:
   the entire stack's first real integration test is still ahead.
2. `/reservations/[id]/contract-preview` crashes with an unhandled
   error in mock mode (found in phase 20's own final walkthrough, not
   yet fixed).
3. Email/WhatsApp/SMS/push notification delivery: architected, not
   configured (no provider credentials exist anywhere).
4. No per-branch access scoping (schema supports it, RLS doesn't
   enforce it yet).
5. Deepgram speech-to-text for the AI Assistant: raised, deliberately
   deferred, never built.
6. No live-device testing of PWA install, offline/airplane-mode
   behavior, or the WebAuthn passkey ceremony — desktop browser only.
7. No formal penetration test or compliance audit.
8. Masked/redacted document previews: evaluated, deliberately declined
   (would need real server-side image processing to be genuine, not
   CSS-only theater).
9. No historical balance/deposit snapshots — always current-state.
10. No customer-complaints data source or a finer "mechanical
    condition" signal beyond inspection ratings/maintenance status.
11. No communication-history (calls/messages) log against a customer
    profile — no messaging concept exists in the system.
12. **Every team-management mutation crashes in mock mode** — invite,
    role change, suspend/reactivate, remove, and (as of productization
    wave 1 phase 3) the new Staff access switches all call
    `createClient()` unconditionally with no `isMockMode()`
    short-circuit, so each throws "Supabase is not configured" the
    moment it's clicked (confirmed directly: `suspendMemberAction`
    crashes with the same error, unrelated to phase 3's own change).
    Reads (the Team page's member list, invite form, the new Access
    panel's switch states) all render correctly in mock mode; only the
    write actions are affected. Pre-existing since whichever phase
    built `app/(dashboard)/employees/actions.ts` — only surfaced now
    because phase 3's browser pass was the first to actually click a
    mutating control on this page in mock mode.

Full detail on all of the above: `Desktop/RentalOS Project Overview.txt`
(written the same day as this freeze, for the founder/engineers/board
review) and the "Known limitations" sections scattered through
`docs/*.md` at the point each was decided.

## Why this matters for productization work

The productization roadmap explicitly reverses part of the engineering
roadmap's own direction — moving from a 7-role workforce permission
system (owner/manager/agent/accountant/driver/cleaner/mechanic) toward
a radically simpler owner-first product. That reversal is deliberate
and expected. This checkpoint exists so that simplification work has a
known-good point to diff against and restore to, and so nobody
mistakes "we're removing/hiding a feature on purpose" for "we broke
something."
