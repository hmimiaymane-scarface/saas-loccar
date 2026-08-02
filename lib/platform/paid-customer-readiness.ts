import type { ReliabilityCheck } from "@/lib/platform/launch-reliability"

/**
 * Roadmap phase 70 ("Paid-Customer Readiness") — "reach the point
 * where charging is responsible," against 10 named requirements. Same
 * shape and same reasoning as phase 67's `LAUNCH_RELIABILITY_CHECKS`
 * (a plain, hand-updated list of discrete point-in-time facts, not a
 * computed one) — several of these ARE the same underlying facts
 * phase 67 already established, cited directly rather than re-derived,
 * so the two lists can never silently disagree about the same
 * evidence. See docs/paid-customer-readiness.md for the full writeup.
 */
export const PAID_CUSTOMER_READINESS_CHECKS: ReliabilityCheck[] = [
  {
    key: "real_database",
    requirement: "Real database proven",
    status: "fail",
    evidence:
      "Auth, CRUD, and RLS are all confirmed live (scripts/phase6-tenant-isolation.ts, real companies/users, self-cleaning) — the foundation genuinely works. But 5 migrations (usage_events, operational_events, pilot_feedback, product_signals, phase 66's launch-gate extensions) were never applied to the live project — confirmed via a live read-only check (PostgREST's PGRST205, 'table not found'). Every /platform/analytics, /platform/operations, /platform/product-signals, and /platform/launch-gate page, plus the /support feedback form, is non-functional against real data until this is applied. Deferred at the account holder's own request — they're handling the live database connection directly, as its own separate task.",
    lastVerified: "2026-08-02",
  },
  {
    key: "data_isolation",
    requirement: "Data isolation proven",
    status: "pass",
    evidence:
      "scripts/phase6-tenant-isolation.ts run live against the real project — 16/16 cross-company read/write/update/delete attempts correctly denied by RLS, verified against each row's actual post-attempt state, not just the call's own return value. Self-cleaned completely.",
    lastVerified: "2026-08-02",
  },
  {
    key: "documents_reliable",
    requirement: "Documents reliable",
    status: "pass",
    evidence:
      "20/20 checks in scripts/phase7-document-pipeline.ts passed live against the real Storage bucket and Postgres project (real uploads of every document type, oversized/disallowed-type rejections, a simulated broken upload, cross-tenant reads) — 3 real gaps found and fixed at the time. The one gap that check documented but didn't fix — a failed DB insert after a successful Storage upload could leave an orphaned file with nothing cleaning it up — is fixed this phase in createDocumentRecord/attachInspectionMedia/attachDamageMedia (lib/__tests__/document-upload-cleanup.test.ts). One smaller, accepted UX gap remains open: a failed browser upload still requires re-picking the file rather than an automatic retry (docs/security.md).",
    lastVerified: "2026-08-02",
  },
  {
    key: "core_workflows_reliable",
    requirement: "Core workflows reliable",
    status: "pass",
    evidence:
      "15 real rental scenarios (new/returning customer, pickup with photos, return with/without damage, outstanding balance, deposit retention, cancellation, no-show, document expiry, offline interruption, staff/role restrictions, a live cross-tenant access attempt) verified end-to-end — docs/rental-scenario-test-suite.md, 791 tests. Rental extension and vehicle exchange remain genuinely unsupported by design (no feature exists yet, tracked separately) — not a reliability gap in what does exist.",
    lastVerified: "2026-08-01",
  },
  {
    key: "phone_experience_polished",
    requirement: "Phone experience polished",
    status: "pass",
    evidence:
      "All 11 named daily operations (morning check, new reservation, customer lookup, pickup, payments, return, late return, photos, contract, expense, end-of-day review) confirmed reachable, phone-width, and touch-usable with zero desktop-only-gated affordance — docs/one-day-phone-simulation.md. The bottom-nav Quick Actions FAB covers 6 of the 11 in one tap.",
    lastVerified: "2026-08-01",
  },
  {
    key: "import_works",
    requirement: "Import works",
    status: "pass",
    evidence:
      "CSV parsing, column matching, and duplicate detection (a real plate collision and a real intra-file duplicate cluster) live-verified in mock mode against real fixture data — docs/company-data-import.md, 45 tests. The actual commit/undo path (commitVehicleImport, undoImportBatch) is reviewed by hand but not yet independently re-exercised against the live database the way phase 67 did for tenant isolation — deferred alongside the migration-application task above, at the account holder's request, not a newly discovered gap.",
    lastVerified: "2026-07-30",
  },
  {
    key: "support_path_exists",
    requirement: "Support path exists",
    status: "fail",
    evidence:
      "The direct-contact channels (WhatsApp/email on /support) have zero database dependency and work regardless of the migration gap. The in-app 'send feedback' form depends on the pilot_feedback table, one of the 5 migrations not yet applied live (see 'Real database proven') — currently non-functional against the real project.",
    lastVerified: "2026-08-02",
  },
  {
    key: "monitoring_exists",
    requirement: "Monitoring exists",
    status: "fail",
    evidence:
      "usage_events/operational_events instrumentation and the /platform/analytics, /platform/operations, and /platform/launch-gate pages are fully built and mock-verified, but every one of them reads from tables among the 5 migrations not yet applied live (see 'Real database proven') — non-functional against the real project until that's resolved.",
    lastVerified: "2026-08-02",
  },
  {
    key: "backup_strategy_exists",
    requirement: "Backup strategy exists",
    status: "pass",
    evidence:
      "docs/backup-and-restore.md — what Supabase backs up automatically, what it doesn't (Storage contents, deployment secrets, this repo's own migration history), and exact restore steps for both an existing-project and total-project-loss scenario. One accepted gap: no off-platform backup of Storage bucket contents.",
    lastVerified: "2026-08-02",
  },
  {
    key: "known_limitations_documented",
    requirement: "Known limitations documented",
    status: "pass",
    evidence:
      "Consolidated for the first time this phase into docs/known-limitations.md — previously scattered across roughly 20 individual phase docs with no single place a business owner deciding whether to charge real customers could read the full list at once.",
    lastVerified: "2026-08-02",
  },
]
