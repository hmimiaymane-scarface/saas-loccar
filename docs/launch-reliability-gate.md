# Launch Reliability Gate

Roadmap phase 67, eighteenth phase of Wave 8, directly after phase
66 (Launch Performance Gate). Brief: "prevent 'works on my machine'
release confidence" — require production build passes, automated
tests pass, real Supabase passes, Android passes, iPhone passes,
weak-network passes, offline recovery passes, tenant isolation passes,
backup/restore process documented. "Done when: launch confidence comes
from evidence."

## Why this is a different shape from phase 66

Phase 66's 9 criteria are live numeric targets, continuously
re-evaluated against real `usage_events`/`operational_events` data —
"is New Rental's median completion time under 3 minutes, right now."
This phase's 9 requirements are discrete, point-in-time **facts**: did
someone actually run the build, actually test on a real Android phone,
actually confirm tenant isolation against the live database. There is
no live metric to compute here — the honest architecture is a plain,
hand-updated evidence list (`lib/platform/launch-reliability.ts`), not
a function that magically knows whether a human held a real iPhone
today. Both are surfaced together on `/platform/launch-gate` (retitled
from "Launch performance gate" to "Launch gate") since they're two
halves of one "are we actually ready" question, not two separate
concerns needing separate pages.

## The 9 requirements, and what's real evidence vs. an honest gap

**5 with real, dated evidence from this exact phase**:

1. **Production build passes** — `npm run build`, run fresh this
   phase (not carried over from an earlier one), clean.
2. **Automated tests pass** — `npx vitest run`, 807/807 passed across
   80 files.
3. **Real Supabase passes** — `scripts/phase6-tenant-isolation.ts` run
   live against the real project (`ooamtywsirpbsfmqsiix`), not mock
   mode. With the user's explicit go-ahead this session (asked first,
   since this connects to and writes to a real shared production
   system, even though the script is self-cleaning), it created two
   real companies, three real `auth.users` rows, and one seeded row in
   each of vehicles/customers/reservations/payments/documents/contracts
   for Company A, then ran every check through each user's own
   anon-key session — exactly the path a real request takes.
4. **Tenant isolation passes** — the same live run: **16/16 checks
   passed** — every cross-company read returned zero rows, every
   cross-company write (update, delete, a forged-`company_id` insert)
   was rejected or affected zero rows, and Company A's data was
   independently re-confirmed unchanged afterward via the row's actual
   state, not just the call's own return value. The script's own
   `finally` block tore down every company, membership, and auth user
   it created — confirmed nothing was left behind.
5. **Backup/restore process documented** — new `docs/backup-and-restore.md`:
   what Supabase's managed Postgres backs up automatically (and what
   plan tier that needs), the three things it explicitly does *not*
   cover (Storage bucket contents, deployment secrets, this repo's own
   migration history), and the exact steps for both an existing-project
   restore and a total-project-loss rebuild.

**4 honestly "not yet verified," each with a real reason, not a
placeholder**:

6. **Android passes** — a concrete, executable test plan already
   exists (`docs/phase-36-device-test-matrix.md`, wave 5 phase 36) but
   has never actually been run: no physical Android device exists in
   this environment, the same standing limitation that document's own
   opening section already named.
7. **iPhone passes** — same shape, `docs/phase-37-iphone-test-matrix.md`
   (wave 5 phase 37), never executed, no physical iPhone available.
8. **Weak-network passes** — the actual UX mechanics for a slow
   connection are built and code-reviewed (`docs/slow-network-experience.md`,
   phase 40 — `SubmitButton`'s pending/slow states), but never
   exercised against a real throttled or packet-dropping connection,
   only reasoned about while reading the code.
9. **Offline recovery passes** — the offline sync queue's pure logic is
   built and unit-tested (phase 16, `docs/offline-queue-hardening.md`),
   but a real device actually going into airplane mode mid-workflow and
   recovering has never been exercised — `docs/phase-36-device-test-matrix.md`
   itself already named this "the single most important thing this
   phase exists to confirm," and it still hasn't been.

## Why "not yet verified," not a fabricated pass

Four of nine genuinely can't be confirmed from this environment — no
physical device, no way to simulate a real dropped cellular connection.
Every prior phase in this roadmap that hit this same wall (16, 36, 37,
and others) recorded it the same honest way rather than inventing a
proxy test that doesn't actually prove the thing. This phase's own
"done when" line — "launch confidence comes from evidence" — is best
served by showing exactly which 5 of 9 have it and which 4 don't, on
one real page, rather than asserting all 9 pass.

## Verification

tsc/eslint/812 tests (807 existing + 5 new in
`lib/platform/__tests__/launch-reliability.test.ts`, covering the
fixed 9-check list, that every check carries real evidence text, that
only a `pass` status carries a `lastVerified` date, and that the 4
device/network-dependent checks are never faked as passing)/build all
clean. Live-verified in mock mode: `/platform/launch-gate` renders both
the existing Performance section and the new Reliability section
together, the 5 real-evidence checks showing today's actual date, and
the 4 not-yet-verified checks showing their real reasons in full.
