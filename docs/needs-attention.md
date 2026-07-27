# Needs You Now (Home screen)

Productization wave 1 phase 11 — "make RentalOS immediately useful
every time it opens." The owner Home screen (`/overview` — see
`docs/business-command-center.md` for why the route is still called
`overview` even though desktop nav labels it "Home") now leads with a
top summary and a single merged attention section, before any
analytics.

## What's on the page, top to bottom

1. **`HomeSummaryStrip`** (`components/domain/overview/home-summary-strip.tsx`)
   — Available / Rented / Returning today, straight from
   `getOverviewMetrics()` (no new query). Icons match
   `lib/status.ts#vehicleStatusConfig`'s Available/Rented colors.
2. **`MorningBriefing`** — unchanged, a short sentence, not analytics.
3. **`NeedsAttentionSection`** (`components/domain/overview/needs-attention-section.tsx`)
   — the new merged list, described below.
4. Everything from the original phase 13 Business Command Center below
   that, unchanged: Today's Operations stats, `BusinessPulseGrid`,
   `RevenueIntelligenceCard`, `HealthOverviewCard`×2, the Opportunities
   card (`feed.business_health`), `FinancialSummaryCard`, `ActivityFeedCard`.

## The merge: `lib/needs-attention.ts#buildNeedsAttentionFeed()`

A pure function combining five sources into one `AttentionCard[]`,
sorted critical → operational → everything else, every card carrying
a real `actionLabel`/`actionHref`:

| Source | Existing function | Card action |
|---|---|---|
| Live alerts (late return, outstanding balance, expiring documents, vehicle unavailable, maintenance, damage, etc.) | `getLiveAlerts()` | The alert's own primary `NotificationAction` |
| Operations feed, critical + operational tiers only | `getOpenOperationsFeedItems()` | The feed item's own `actionHref` |
| Booking requests awaiting a decision | `getRecentBookingRequests()` | Links to `/reservations/{id}`, where `ReservationStatusActions` already has real Confirm/Decline buttons — no second decision UI |
| Contracts awaiting signature | `searchContracts(..., {status: "awaiting_signature"})` | Links to `/contracts/{id}`, where `ContractSignatureSection` already lives |
| Customers missing an identity document before an upcoming pickup | `lib/customer-readiness-store.ts#getUpcomingReservationsMissingIdentityDocument` (new) | Links to `/customers/{id}` |

No per-alert-type filtering — every `LiveAlert` type flows through
uniformly. The brief's named card list ("may include...") is
illustrative, not an exclusive whitelist.

**Dismiss is conditional, not universal.** Only operations-feed-sourced
cards are `dismissible: true` (they're the only ones backed by a real
`operations_feed_items` row). `InsightFeedItem` was changed to only
render its Dismiss button when `onDismiss` is actually passed, so the
other four sources don't show a dead button.

**Financial-access parity with the Notification Center**: alerts are
run through `filterByFinancialAccess()` before merging, the same rule
`getNotificationFeed()` already applies — a Staff member without
`view_financial_reports` never sees a payment-shaped card here either.

## The missing-document detector

`lib/customer-readiness.ts#findCustomersMissingIdentityDocument` is
pure — it reuses `assessReturningCustomerReadiness` (the same identity
check the Customer Command Center already uses) across every customer
with a pickup in the next `MISSING_DOCUMENT_WINDOW_DAYS` (3) days,
instead of one customer at a time. Only the identity-document signal
surfaces as a card; a licence-expiry issue is a different fix (edit a
date field, not upload a file) and already has its own advisory on the
customer page. A customer with more than one upcoming reservation is
flagged once, against the soonest pickup.

## Known limitation

Same recurring caveat as every AI/database-only feature since the
original roadmap's phase 03: mock mode has no contracts or
reservation/customer/document linkage rich enough to simulate
readiness, so contract-awaiting-signature and missing-document cards
only ever produce real data against a live Supabase project. Verified
via the same fake-Supabase-client/pure-function unit tests every other
DB-touching feature in this codebase uses, not against real Postgres.

## Scope

Desktop's `/overview` only. Mobile's `/home` mission feed
(`lib/mobile/mission-feed.ts`, roadmap phase 16) is a different,
already-working "needs you now" equivalent for mobile — per-employee,
today-scoped — and is untouched by this phase.
