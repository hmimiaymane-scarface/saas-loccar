# Pilot Release Candidate

Roadmap phase 68, twentieth phase of Wave 8, directly after phase 67
(Launch Reliability Gate). Brief: "create the first build intended for
actual daily use." Rules: feature freeze — only bug fixes, UX
blockers, reliability issues; no speculative features; no major
architecture changes. "Done when: one version can stay stable long
enough for meaningful real-world feedback."

## What this phase is, honestly

Not a feature phase — a discipline phase. The job was to find and fix
**actual bugs**, not to extend the "known gaps" list every recent
phase has been accumulating (rental extension, vehicle exchange, NPS
scoring, page-load telemetry, and the rest — all real, all
deliberately **not touched here**, because a feature freeze means
exactly that). One real reliability bug was found, fixed, and verified
live; everything else already reviewed clean.

## The one real fix: service-worker update reload

**The bug**: `public/sw.js`'s `install` handler calls
`self.skipWaiting()` and its `activate` handler calls
`self.clients.claim()` — a new service-worker version takes control of
every already-open tab immediately after a deploy. Without a matching
reload, this is the textbook "skipWaiting without reload" PWA trap:
the already-open tab keeps running its **old** in-memory JS module
graph while its network requests silently start routing through the
**new** worker. The first client-side navigation to a route whose
chunk wasn't already loaded can then fail with a "module factory is
not available" class of error — invisible to the user until they
happen to hit it. This is precisely what phase 62 flagged ("a feature
could go silently, invisibly non-functional... with zero visible
error") and left uninvestigated; it's also the identical error shape
this session's own browser-automation testing hit repeatedly from a
stale dev-server cache — same symptom, different trigger, same root
cause class.

**The fix** (`components/pwa/service-worker-register.tsx`): listen for
`controllerchange` and reload the page exactly once when it fires —
the standard, minimal mitigation for this exact anti-pattern. Also
re-checks for an update (`registration.update()`) whenever the tab
regains focus, since a PWA left open across a deploy would otherwise
only notice on the browser's own infrequent background check (often
~24h).

**Verified live, not just reasoned about in code review** — this is
one of the few reliability claims in this whole roadmap that could
actually be executed end-to-end in this environment, since it's a
browser/service-worker lifecycle behavior, not a real-device
requirement:

1. Registered the service worker fresh in a real Chrome tab, confirmed
   active (`registration.active.state === "activated"`), set a
   JS-level marker (`window.__loadMarker`) to detect a reload.
2. Edited `public/sw.js`'s cache version strings (`v1` → `v2`) to
   simulate a real deploy, without restarting anything else.
3. Called `registration.update()` (what the new focus-triggered check
   does automatically) — the browser detected the changed file,
   installed the new worker, `skipWaiting`/`clients.claim` fired as
   before.
4. Confirmed the fix actually worked: `window.__loadMarker` came back
   `undefined` (proof the page genuinely reloaded, not just that the
   worker activated), the cache keys were now `rentalos-static-v2`/
   `rentalos-pages-v2` (proof the new worker, not the old one, was
   controlling the page), and a screenshot immediately after showed
   the app in a completely normal, working state — one clean reload,
   no loop, no visible disruption.
5. Reverted the test-only `v1`→`v2` bump in `public/sw.js` back to
   `v1` — the version strings themselves didn't need to change, only
   the registration component's handling of a real future change to
   them.

**Known, accepted tradeoff, documented rather than solved**: a reload
can lose unsaved input in a plain form field the user was mid-typing.
This doesn't affect the pickup/return offline queue (already persists
to IndexedDB independent of page lifecycle), and was judged strictly
better than the alternative — a silently broken feature with no way
for the user to even know why. A confirmation prompt before reloading
would be new UI, not a bug fix, so it wasn't added here.

## What was reviewed and found already clean

- Full `tsc`/`eslint`/`vitest` (812 tests)/`next build` pass, re-run
  fresh this phase specifically to confirm the baseline this release
  candidate freezes is actually green right now, not assumed from an
  earlier phase's run.
- A live mock-mode smoke pass across Overview, Contracts,
  Contract Templates, and the platform console's Launch Gate page
  (the four surfaces this and the two immediately preceding phases
  touched) — all rendering and behaving correctly.

## What was deliberately NOT touched (feature freeze in effect)

Every "known gap" named in this project's own accumulated memory was
reviewed against one question: **is this an actual bug, or a
deliberate, already-reasoned scope boundary?** Only the service-worker
issue above was the former. Left untouched, on purpose:

- No rental-extension or vehicle-exchange flow (phase 61) — these are
  missing *features*, not bugs; building either now would violate "no
  speculative features" directly.
- The locale/date-formatting inconsistency across `lib/format.ts`/
  `lib/reports.ts`/`lib/contracts/context.ts` (phase 56) — cosmetic
  inconsistency, nothing renders incorrectly or crashes; a real fix
  touches enough files to risk being a "major" change for a
  feature-freeze phase.
- Raw error messages flowing unredacted into platform-admin-only
  observability tables (phase 60) — low severity, founder-only
  exposure, not something a pilot owner would ever perceive.
- No PDF export of the onboarding walkthrough, no NPS scale, no email
  alert on new feedback (phase 63); no automated behavior detection,
  no generic page-view tracking, no cross-signal trend dashboard
  (phase 64); vehicle/customer detail-page density (phase 65); no
  automated Home-load/Calendar timing (phase 66) — all genuine
  feature/enhancement ideas, correctly out of scope here.
- Android/iPhone/weak-network/offline-recovery real-device testing
  (phase 67) — still can't be executed from this environment; a
  feature-freeze phase doesn't change that reality, only a real device
  does.

## What "stable enough for real-world feedback" means here

This build is what a pilot runs starting now. Ongoing health during
the pilot is what `/platform/launch-gate` (phases 66-67) already
exists to show — Performance criteria against live usage data,
Reliability facts kept honest and hand-updated. Real pilot behavior
feeds back through `/platform/product-signals` (phase 64). Nothing new
was built for "detecting" release-candidate health; the instruments
already exist from the immediately preceding phases.

## Verification

tsc/eslint/812 tests (no new tests — the fix is a browser-lifecycle
behavior verified live in a real browser, not something meaningfully
unit-testable in isolation)/build all clean. Live-verified end to end
as described above — the one real change this phase made was proven
to work, not just reviewed.

Tagged `pilot-rc-1` at this phase's commit.
