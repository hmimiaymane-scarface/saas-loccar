# Security Revalidation After Productization

Roadmap phase 60, directly after phase 59. Brief: "ensure UI
simplification did not weaken security." Re-test: RLS, staff
restrictions, document access, contract access, payment visibility,
platform-admin isolation, storage URLs, sensitive logs. "Done when:
simpler UX has not created broader access."

This phase re-audits Wave 8 ("Polish, Observability, Security, and
Launch Confidence," phases 51-59 — `e90dd51`..`b86f215`) against the
security model `docs/security.md` already documents, rather than
re-deriving that model from scratch. Method: diff every file wave 8
touched against the eight named areas, not just read code in isolation
— a regression is something that changed, so the diff itself is the
audit surface.

## Headline finding

**No RLS, permission, or access-control regression.** Wave 8 added
zero new server actions or API routes (`git diff --diff-filter=A
ae0f247..b86f215 -- '*actions.ts' '*route.ts'` returns nothing — every
route wave 8 touches already existed) and touched zero files under
`lib/permissions/`, `lib/auth/`, `app/(dashboard)/documents/`,
`app/(dashboard)/contracts/`, `lib/contracts/`, or `proxy.ts`. The
9-phase wave's actual footprint is two new append-only, platform-admin-
only tables (phases 58-59, already covered by `docs/security.md`'s "What
the app layer adds on top" section and this project's checkpoint memory)
plus cosmetic component swaps (shared `ListItemCard`/`SearchInput`/
`StatusBadge`/`Checkbox`/`Textarea` components replacing hand-rolled
markup with identical fields and identical role gates underneath).

One real, narrow finding — below — plus one pre-existing, deliberately
unfixed limitation worth naming explicitly now that this phase asked
the question.

## Area by area

**RLS.** Only two migrations were added all wave (`20260815090000_usage_events.sql`,
`20260816090000_operational_events.sql`); zero existing migrations were
modified. Both new tables: RLS enabled, a `is_company_member(company_id)`-
gated INSERT policy and **no SELECT policy for anyone, including
`is_platform_admin()`** — every platform-facing read goes through a
`security definer` function (`platform_get_usage_summary`,
`platform_get_dropoff_summary`, `platform_get_operational_summary`,
`platform_get_recent_operational_events`, `platform_get_ai_call_summary`)
that opens with `perform public.assert_platform_admin()` before
returning anything, and each pins `set search_path = public` — the
identical pattern every other `platform_*` function in
`docs/security.md`'s "Platform-owner boundary" section already uses.
Confirmed directly in the migration SQL, not just by re-reading last
session's summary.

**Staff restrictions.** Zero touches to `lib/permissions/`, any
`actions.ts`, or `has_permission()`'s call sites during wave 8. Phase
51's "confirmation + destructive styling for 5 no-confirm actions"
checkpoint added client-side confirm dialogs — a UX safety net, not a
role gate — and didn't touch any server-side check.

**Document access.** Zero touches to `app/(dashboard)/documents/`,
`lib/storage.ts`'s `validateUploadForCompany()`, or the
`download_documents`-gated RLS/storage policies from productization
wave 1 phases 7/19. Untouched, confirmed by direct diff, not inference.

**Contract access.** Zero touches to `app/(dashboard)/contracts/` or
`lib/contracts/*` — phase 56's RTL audit read this pipeline
(`lib/contracts/pdf-render.ts`) but changed nothing there (its finding,
the Latin-only/non-bidi limitation, is already recorded in
`docs/rtl-readiness-audit.md` and this project's checkpoint memory).

**Payment visibility.** The only touches: `app/api/exports/payments/route.ts`
gained `withRouteObservability` (phase 59's generic wrapper — the
`requireExportAccess(["owner", "manager", "accountant"])` gate above it
is byte-for-byte unchanged), and `payment-filters.tsx`/`payment-list-item.tsx`
swapped hand-rolled markup for the shared `SearchInput`/`ListItemCard`
components (phase 51) — same fields rendered, same data source, purely
cosmetic. Diffed both directly to confirm no field was added or role
check removed.

**Platform-admin isolation.** `/platform/analytics` and
`/platform/operations` (phases 58-59's new pages) are children of
`app/platform/layout.tsx`, whose `requirePlatformAdminPage()` call is
untouched by wave 8's diff to that file (which only added two nav
`<Link>`s) — Next's layout nesting means both new pages inherit that
gate automatically, the same way every existing `/platform/*` page
does. Every new read function is additionally gated by its own
`assert_platform_admin()` (see RLS above) — belt-and-suspenders, same
as the rest of this tier.

**Storage URLs.** No changes to `getSignedUrl()`, the `storage.objects`
RLS policies, or the bucket's `file_size_limit`/`allowed_mime_types`
(all from productization wave 1 phase 7). One finding here, folded into
"sensitive logs" below since it's the same underlying issue.

**Sensitive logs — the one real finding.** `lib/storage-client.ts`'s
`uploadFile()` (phase 59) logged the full Storage `path` on failure,
built by `buildStoragePath()` as
`{companyId}/{...segments}/{uuid}-{sanitized original filename}` — the
final segment keeps the user's own filename (lowered through a
character allowlist, not replaced), which for an identity-document
upload can be a real name, ID number, or similar the customer chose as
their filename. That logged event lands in `operational_events`, read
only via `platform_get_recent_operational_events` (see RLS above) — so
this was never tenant-visible or public, but it did mean a platform
operator debugging a failed upload could incidentally see a
customer-chosen filename that wasn't necessary for the debugging signal
itself (company, category, file type/size, and the Storage error
message are). **Fixed**: now logs `pathPrefix` (everything before the
final `{uuid}-{filename}` segment) instead of the full path — same
company/category debugging context, filename segment dropped entirely.
No test previously pinned the old shape (`storage-client.ts` has no
dedicated unit test; `lib/offline/__tests__/sync.test.ts` mocks
`uploadFile` wholesale), so nothing needed updating alongside the fix.

**Related, pre-existing, deliberately NOT fixed this phase**: several
other observability call sites (`app/(dashboard)/error.tsx`'s crash
boundary, `import-wizard.tsx`'s commit-failure handler, every
`withRouteObservability`-wrapped route's catch block) log a raw
`error.message`/`result.error` string verbatim into `usage_events`/
`operational_events`. If some future error path ever embeds a
customer's own data in its message text (a validation error naming a
duplicate phone number, for instance), that text would reach the same
platform-admin-only tables the finding above does. Confirmed today
these strings are all generic ("Could not save that," Postgres error
codes, etc.) — no live example of a message actually carrying tenant
PII was found. A blanket redaction layer across every error path in
this app would be a real architecture addition (identical trade-off
`docs/security.md` already declined for masked document previews in
phase 19: "a materially larger lift than this pass's scope"), not
proportionate to a revalidation pass that found no wave-8-introduced
instance of it. Worth a human's attention if a future phase adds an
error path that echoes raw user input back into its message.

## Verification

tsc/eslint/774 tests/build all clean after the `storage-client.ts` fix.
No live-browser check was run for this specific change — it alters
what a failed-upload log entry's `metadata` field contains
server-side, which has no rendered UI surface to click through; the
existing "every mutation throws in mock mode" limitation (see
`AGENTS.md`) means the failure path itself was never live-clickable in
this environment anyway, wave 8's own doc (`docs/error-monitoring.md`)
already recorded the same constraint for this exact function.
