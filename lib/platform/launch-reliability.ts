/**
 * Roadmap phase 67 (Launch Reliability Gate) — "prevent 'works on my
 * machine' release confidence." Unlike phase 66's launch-gate
 * criteria (live numeric metrics evaluated automatically against
 * `usage_events`/`operational_events`), every one of these 9
 * requirements is a discrete, point-in-time fact a human confirms —
 * "did the build pass," "did a real device pass" — not something with
 * a continuously-measured value. This is deliberately a plain,
 * hand-updated list, not a computed one: fabricating a live "status"
 * for "did someone test this on a real iPhone" would be exactly the
 * kind of fake evidence this phase exists to prevent. Update this file
 * by hand whenever one of these is actually re-verified, the same way
 * `docs/phase-36-device-test-matrix.md` says its own results section
 * gets filled in "the next session it's actually run," never
 * speculatively.
 */

export type ReliabilityStatus = "pass" | "fail" | "not_verified"

export interface ReliabilityCheck {
  key: string
  requirement: string
  status: ReliabilityStatus
  /** What was actually checked, and how — never a bare assertion. */
  evidence: string
  /** ISO date of the run this evidence comes from, or null if this
   * has never actually been executed/verified at all. */
  lastVerified: string | null
}

export const LAUNCH_RELIABILITY_CHECKS: ReliabilityCheck[] = [
  {
    key: "build",
    requirement: "Production build passes",
    status: "pass",
    evidence: "`npm run build` — clean, zero errors, all routes compiled (re-run fresh this phase, not carried over from an earlier one)",
    lastVerified: "2026-08-02",
  },
  {
    key: "tests",
    requirement: "Automated tests pass",
    status: "pass",
    evidence: "`npx vitest run` — 807/807 tests passed across 80 files",
    lastVerified: "2026-08-02",
  },
  {
    key: "real_supabase",
    requirement: "Real Supabase passes",
    status: "pass",
    evidence: "scripts/phase6-tenant-isolation.ts run live against the real project (not mock mode) — created real companies/users/rows via the anon key, all operations behaved as expected, cleaned up completely",
    lastVerified: "2026-08-02",
  },
  {
    key: "tenant_isolation",
    requirement: "Tenant isolation passes",
    status: "pass",
    evidence: "Same live run as above — 16/16 cross-company read/write/update/delete attempts correctly denied by RLS, verified against the row's actual post-attempt state, not just the call's own return value",
    lastVerified: "2026-08-02",
  },
  {
    key: "android",
    requirement: "Android passes",
    status: "not_verified",
    evidence: "A concrete, executable test plan exists (docs/phase-36-device-test-matrix.md) — never executed. No physical Android device exists in this environment.",
    lastVerified: null,
  },
  {
    key: "iphone",
    requirement: "iPhone passes",
    status: "not_verified",
    evidence: "A concrete, executable test plan exists (docs/phase-37-iphone-test-matrix.md) — never executed. No physical iPhone exists in this environment.",
    lastVerified: null,
  },
  {
    key: "weak_network",
    requirement: "Weak-network passes",
    status: "not_verified",
    evidence: "The UX mechanics for a slow connection are built and reviewed (docs/slow-network-experience.md — SubmitButton's slow/pending states) but never exercised against a real throttled or dropping connection, only reasoned about in code review.",
    lastVerified: null,
  },
  {
    key: "offline_recovery",
    requirement: "Offline recovery passes",
    status: "not_verified",
    evidence: "The offline sync queue is built and its pure logic is unit-tested (phase 16, docs/offline-queue-hardening.md), but a real device going into airplane mode mid-workflow and recovering has never been exercised — the single item docs/phase-36-device-test-matrix.md itself calls \"the most important thing this phase exists to confirm.\"",
    lastVerified: null,
  },
  {
    key: "backup_restore",
    requirement: "Backup/restore process documented",
    status: "pass",
    evidence: "docs/backup-and-restore.md — what Supabase backs up automatically, what it doesn't (Storage contents, deployment secrets, migration history), and the exact restore steps for both an existing-project and total-project-loss scenario.",
    lastVerified: "2026-08-02",
  },
]
