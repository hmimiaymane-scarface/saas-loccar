import { describe, expect, it } from "vitest"

import { makeFakeSupabase } from "./helpers/fake-supabase"

/**
 * Roadmap phase 19 requirement 1 / acceptance criterion: a dedicated
 * cross-tenant isolation suite covering tables introduced across phases
 * 01-18. **This tests application-layer discipline — every query
 * function here always includes `.eq("company_id", ...)` before
 * returning rows — not Postgres RLS itself.** RLS is the real security
 * boundary (see docs/security.md's own opening line: "RLS is the only
 * thing that enforces isolation"), and this repo has no live Postgres/
 * Docker access to exercise it directly, the same limitation every
 * phase since 03 has carried. What this suite *can* prove, and does: if
 * a future change ever dropped a `company_id` filter from one of these
 * read functions, RLS would still catch it in production — but this
 * suite would also catch it here, in a 5-second test run, before that
 * ever ships.
 *
 * Scope note — not every phase-01-18 table has a TS accessor to test:
 * `role_permission_defaults`/`employee_permission_overrides` are only
 * ever read by the SQL `has_permission()` function itself (no TS reader
 * queries across companies to leak from); `notifications` is covered by
 * lib/data.ts#getNotificationFeed, whose company-scoping is
 * straightforward to audit by inspection but pulls in enough unrelated
 * machinery (has_permission() RPC calls, the live-alerts fan-out) that
 * building a matching fake-client harness for it isn't proportionate to
 * this pass; `document_extractions` has no bulk-list-by-company reader
 * — every read is scoped by an already company-gated `document_id`.
 *
 * `approval_requests`: covered here until productization wave 1 phase 2
 * removed the visible approval-workflow UI (and its `getApprovalRequests`
 * accessor) from the product — the table and its RPCs still exist at
 * the database level to reduce rewrite risk, but there is no longer a
 * TS reader to test against. Same class of gap as the others above.
 */

import { getCustomerIntelligence } from "@/lib/customer-intelligence-store"
import { getVehicleIntelligence } from "@/lib/vehicle-intelligence-store"
import { getOpenOperationsFeedItems } from "@/lib/operations-feed/data"
import { getEventsForEntity } from "@/lib/activity-log"
import { getTemplateVersion } from "@/lib/contracts/template-store"
import type { SessionContext } from "@/lib/auth/session"

function sessionFor(companyId: string): SessionContext {
  return {
    userId: "user-1",
    email: "person@test.co",
    profile: { fullName: "Person", avatarPath: null, phone: null, preferredLanguage: "en" },
    company: {
      id: companyId,
      name: "Test Co",
      slug: "test-co",
      city: null,
      country: "Morocco",
      currency: "MAD",
      timezone: "Africa/Casablanca",
      status: "active",
      maintenanceReminderDays: 14,
      documentExpiryWarningDays: 30,
      agentsCanRecordExpenses: false,
      mutedNotificationTypes: [],
    },
    role: "owner",
  }
}

const COMPANY_A = "co_a"
const COMPANY_B = "co_b"

describe("cross-tenant isolation — customer_intelligence", () => {
  it("never returns another company's row for the same customerId", async () => {
    const { client, tables } = makeFakeSupabase({
      customer_intelligence: [
        { company_id: COMPANY_B, customer_id: "cus_1", trust_score: 90, trust_band: "excellent", trust_factors: {}, lifetime_revenue_mad: "1000", rental_frequency_per_year: "2", average_reservation_mad: "500", expected_future_value_mad: "500", preferred_category: null, summary: "B's data", computed_reason: null, computed_at: "2026-01-01" },
      ],
    })
    const result = await getCustomerIntelligence(client, sessionFor(COMPANY_A), "cus_1")
    expect(result).toBeNull()
    expect(tables.customer_intelligence).toHaveLength(1) // sanity: the row really exists, just for the other company
  })
})

describe("cross-tenant isolation — vehicle_intelligence", () => {
  it("never returns another company's row for the same vehicleId", async () => {
    const { client } = makeFakeSupabase({
      vehicle_intelligence: [
        { company_id: COMPANY_B, vehicle_id: "veh_1", health_score: 80, health_band: "good", health_factors: {}, profitability_net_mad: "100", profitability_breakdown: {}, utilization: {}, summary: "B's data", recommendations: [], recommendations_confidence: "high", computed_reason: null, computed_at: "2026-01-01" },
      ],
    })
    const result = await getVehicleIntelligence(client, sessionFor(COMPANY_A), "veh_1")
    expect(result).toBeNull()
  })
})

describe("cross-tenant isolation — operations_feed_items", () => {
  it("never returns another company's open feed items", async () => {
    const { client } = makeFakeSupabase({
      operations_feed_items: [
        { id: "item_b", company_id: COMPANY_B, status: "open", observer_type: "idle_vehicle", entity_type: "vehicle", entity_id: "veh_1", priority_tier: "critical", observation: "B's item", reasoning: "", suggested_action: "", action_label: "", action_href: "", confidence: "high", first_detected_at: "2026-01-01", last_seen_at: "2026-01-01" },
        { id: "item_a", company_id: COMPANY_A, status: "open", observer_type: "idle_vehicle", entity_type: "vehicle", entity_id: "veh_2", priority_tier: "critical", observation: "A's item", reasoning: "", suggested_action: "", action_label: "", action_href: "", confidence: "high", first_detected_at: "2026-01-01", last_seen_at: "2026-01-01" },
      ],
    })
    const result = await getOpenOperationsFeedItems(client, COMPANY_A)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("item_a")
  })
})

describe("cross-tenant isolation — activity_log", () => {
  it("never returns another company's events for the same entity id", async () => {
    const { client } = makeFakeSupabase({
      activity_log: [
        { id: "ev_b", company_id: COMPANY_B, entity_type: "reservation", entity_id: "res_shared_id", type: "reservation_confirmed", title: "B's event", description: null, metadata: null, actor_id: "user-x", actor_type: "user", source: "web", created_at: "2026-01-01" },
      ],
    })
    const result = await getEventsForEntity(client, COMPANY_A, "reservation", "res_shared_id")
    expect(result).toHaveLength(0)
  })
})

describe("cross-tenant isolation — contract_template_versions", () => {
  it("never returns another company's template version by id", async () => {
    const { client } = makeFakeSupabase({
      contract_template_versions: [
        { id: "ver_1", company_id: COMPANY_B, template_id: "tpl_1", version_number: 1, status: "active", sections: [], variable_mappings: [], ai_notes: null, created_by: "user-x", created_at: "2026-01-01" },
      ],
    })
    const result = await getTemplateVersion(client, COMPANY_A, "ver_1")
    expect(result).toBeNull()
  })
})
