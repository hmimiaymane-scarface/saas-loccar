import { describe, expect, it, vi } from "vitest"

import { ACTIVITY_TYPES, ENTITY_TYPES } from "@/types/rental"
import { recordEvent, daysAgoIso } from "@/lib/activity-log"

// A minimal stand-in for the Supabase client's `.from(table).insert(row)`
// chain — supports both being awaited directly (as recordEvent does) and
// `.select(...).single()` (as the real create-row actions do). Real
// Supabase mocking has no precedent elsewhere in this repo (see
// docs/supabase.md / the rest of lib/__tests__ — everything else tests
// pure functions), so this is deliberately small and single-purpose
// rather than a general fixture.
function makeFakeSupabase() {
  const inserted: { table: string; row: Record<string, unknown> }[] = []

  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ table, row })
          const resolved = { data: { id: `fake-${table}-id` }, error: null }
          const promise = Promise.resolve(resolved)
          return Object.assign(promise, {
            select: () => ({ single: async () => resolved }),
          })
        },
      }
    },
  }

  return { client, inserted }
}

describe("ACTIVITY_TYPES / ENTITY_TYPES", () => {
  // Regression guard: this array is the TS-side single source of truth,
  // cross-referenced against the `activity_log` check constraints —
  // originally supabase/migrations/20260723090000_event_backbone.sql,
  // extended by 20260731090000_contract_lifecycle.sql (roadmap phase
  // 11) and 20260806090000_phase19_document_access_logging.sql (roadmap
  // phase 19). If either side changes without the other, this is what
  // catches the drift instead of it surfacing as a runtime insert
  // failure.
  it("matches the type check constraint (event backbone + phase 11's contract lifecycle extension + phase 19's document access logging)", () => {
    expect(ACTIVITY_TYPES).toEqual([
      "reservation_requested",
      "reservation_confirmed",
      "reservation_status_changed",
      "reservation_updated",
      "reservation_cancelled",
      "payment_recorded",
      "payment_refunded",
      "vehicle_picked_up",
      "vehicle_returned",
      "vehicle_status_changed",
      "maintenance_completed",
      "customer_created",
      "customer_updated",
      "document_uploaded",
      "member_invited",
      "pickup_started",
      "return_started",
      "inspection_completed",
      "inspection_corrected",
      "damage_recorded",
      "damage_resolved",
      "deposit_collected",
      "deposit_returned",
      "deposit_retained",
      "maintenance_scheduled",
      "vehicle_entered_maintenance",
      "maintenance_cancelled",
      "expense_recorded",
      "user_suspended",
      "user_reactivated",
      "user_removed",
      "invitation_accepted",
      "rental_extended",
      "contract_generated",
      "contract_signed",
      "contract_prepared",
      "contract_sent_for_signature",
      "contract_activated",
      "contract_completed",
      "contract_archived",
      "contract_cancelled",
      "contract_amended",
      "contract_viewed",
      "contract_printed",
      "contract_downloaded",
      "template_created",
      "template_version_activated",
      "document_viewed",
      "document_downloaded",
    ])
  })

  it("matches the entity_type check constraint added in the event-backbone migration", () => {
    expect(ENTITY_TYPES).toEqual([
      "customer",
      "vehicle",
      "reservation",
      "inspection",
      "damage",
      "maintenance",
      "expense",
      "document",
      "invitation",
      "membership",
      "contract",
    ])
  })
})

describe("daysAgoIso", () => {
  it("returns an ISO timestamp N days before the given date", () => {
    const from = new Date("2026-07-20T12:00:00.000Z")
    expect(daysAgoIso(30, from)).toBe("2026-06-20T12:00:00.000Z")
  })

  it("handles a 0-day window as 'now'", () => {
    const from = new Date("2026-07-20T12:00:00.000Z")
    expect(daysAgoIso(0, from)).toBe(from.toISOString())
  })
})

describe("recordEvent", () => {
  it("inserts a row with the full event shape, defaulting actorType and source", async () => {
    const { client, inserted } = makeFakeSupabase()

    await recordEvent(client as never, {
      companyId: "co_atlas",
      actorId: "user-1",
      type: "damage_recorded",
      entityType: "damage",
      entityId: "damage-1",
      title: "Damage recorded: bumper",
      description: "Scratch on rear bumper",
      metadata: { reservation_id: "res-1" },
    })

    expect(inserted).toEqual([
      {
        table: "activity_log",
        row: {
          company_id: "co_atlas",
          actor_id: "user-1",
          actor_type: "user",
          type: "damage_recorded",
          entity_type: "damage",
          entity_id: "damage-1",
          title: "Damage recorded: bumper",
          description: "Scratch on rear bumper",
          metadata: { reservation_id: "res-1" },
          source: "web",
        },
      },
    ])
  })

  it("supports a system/ai actor with a null actorId", async () => {
    const { client, inserted } = makeFakeSupabase()

    await recordEvent(client as never, {
      companyId: "co_atlas",
      actorId: null,
      actorType: "ai",
      source: "background_job",
      type: "vehicle_status_changed",
      entityType: "vehicle",
      entityId: "veh-1",
      title: "Vehicle flagged idle",
    })

    expect(inserted[0].row).toMatchObject({
      actor_id: null,
      actor_type: "ai",
      source: "background_job",
    })
  })
})

// --- Integration-style: a real server action wired through recordEvent ---
//
// createCustomer (app/(dashboard)/customers/actions.ts) was, before this
// phase, the one customer-creation path with no activity logging at all —
// see the roadmap phase 01 plan. This proves the gap is actually closed,
// not just that recordEvent works in isolation.
//
// Only @/lib/supabase/server needs mocking: requireSession() and
// findCustomerByPhone() both short-circuit to this repo's existing mock
// data mode (isSupabaseConfigured is false under vitest — see lib/env.ts
// and lib/mock/company.ts), so no auth/session mocking is needed. next/cache
// is stubbed because revalidatePath has no real request context to act on
// here.
const supabaseMock = vi.hoisted(() => {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ table, row })
          const resolved = { data: { id: `fake-${table}-id` }, error: null }
          const promise = Promise.resolve(resolved)
          return Object.assign(promise, {
            select: () => ({ single: async () => resolved }),
          })
        },
      }
    },
  }
  return { inserted, client }
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseMock.client,
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}))

describe("createCustomer", () => {
  it("emits a customer_created event with the new customer's entity id", async () => {
    const { createCustomer } = await import("@/app/(dashboard)/customers/actions")

    const formData = new FormData()
    formData.set("fullName", "Aicha Bennani")
    formData.set("phone", "+212600000099")

    const result = await createCustomer({}, formData)

    expect(result.error).toBeUndefined()
    expect(result.customerId).toBe("fake-customers-id")

    const activityInsert = supabaseMock.inserted.find((entry) => entry.table === "activity_log")
    expect(activityInsert?.row).toMatchObject({
      company_id: "co_atlas",
      actor_id: "mock-user",
      type: "customer_created",
      entity_type: "customer",
      entity_id: "fake-customers-id",
    })
  })
})
