import { describe, expect, it, vi } from "vitest"

/**
 * Roadmap phase 61 — "test the product as a rental company, not as
 * developers." Fifteen named scenarios, each its own describe block
 * numbered to match the phase brief, composing this repo's real
 * business-logic functions (not re-deriving new fixtures) into the
 * actual customer-facing situation a rental company hits.
 *
 * Scope, honestly stated up front (see docs/rental-scenario-test-suite.md
 * for the full per-scenario writeup, including the scenarios only
 * partially covered here): this environment has no live Postgres/browser
 * access by default (AGENTS.md's "Testing conventions"), so every
 * scenario here is composed from pure functions and the handful of
 * server actions that are safely mockable (`checkCustomerByPhone`,
 * `updateReservation`) rather than a full click-through or a real DB
 * round trip. Where a scenario's real substance requires a live camera,
 * a real AI vision call, or a live cross-tenant Postgres session, this
 * file says so in that scenario's own block rather than faking a result
 * — matching every other phase's own verification-honesty convention.
 */

// --- Scenarios 8, 9, 15 share one real server action (updateReservation)
// and therefore one small, narrow fake Supabase client — same
// "one fake per file, only as capable as this file's own tests need"
// convention as lib/__tests__/activity-log.test.ts and
// lib/contracts/__tests__/template-store.test.ts.
const reservationFixture = vi.hoisted(() => ({
  rows: [] as { id: string; company_id: string; status: string }[],
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      if (table !== "reservations") throw new Error(`rental-scenario-suite's fake client only stubs "reservations", got "${table}"`)
      const filters: Record<string, unknown> = {}
      const builder = {
        select: () => builder,
        eq(key: string, value: unknown) {
          filters[key] = value
          return builder
        },
        maybeSingle: () => {
          const match = reservationFixture.rows.find(
            (r) => (filters.id === undefined || r.id === filters.id) && (filters.company_id === undefined || r.company_id === filters.company_id)
          )
          return Promise.resolve({ data: match ? { status: match.status } : null, error: null })
        },
      }
      return builder
    },
  }),
}))

vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

describe("Scenario 1 — New customer + new rental", () => {
  it("a genuinely new phone number matches no existing customer (no false 'welcome back')", async () => {
    // findCustomerByPhone (lib/data.ts) short-circuits to the real mock
    // fixtures under vitest (isMockMode() true) — zero Supabase mocking
    // needed, this exercises the exact function the intake form calls.
    const { checkCustomerByPhone } = await import("@/app/(dashboard)/reservations/actions")
    const result = await checkCustomerByPhone("+212600000000")
    expect(result).toBeNull()
  })
})

describe("Scenario 2 — Returning customer rental", () => {
  it("an existing customer's exact phone number resolves to their real record", async () => {
    const { checkCustomerByPhone } = await import("@/app/(dashboard)/reservations/actions")
    // Khadija Idrissi, lib/mock/customers.ts#cus_1 — 6 prior bookings,
    // a genuine "returning customer" fixture rather than an invented one.
    const result = await checkCustomerByPhone("+212 661-234567")
    expect(result).not.toBeNull()
    expect(result?.fullName).toBe("Khadija Idrissi")
  })
})

describe("Scenario 3 — Pickup with photos", () => {
  it("blocks completion while a required photo slot is missing, allows it once all are captured", async () => {
    const { REQUIRED_PHOTO_SLOT_KEYS } = await import("@/lib/inspections/photo-slots")
    const { missingRequiredPhotoSlots, isPickupInspectionComplete } = await import("@/lib/inspections/rules")

    const capturedAllButLast = REQUIRED_PHOTO_SLOT_KEYS.slice(0, -1)
    expect(missingRequiredPhotoSlots(capturedAllButLast)).toEqual([REQUIRED_PHOTO_SLOT_KEYS.at(-1)])

    const partialProgress = {
      odometerKm: 41250,
      fuelLevel: "full" as const,
      capturedPhotoSlotKeys: capturedAllButLast,
      existingDamageReviewed: true,
    }
    expect(isPickupInspectionComplete(partialProgress)).toBe(false)

    const fullProgress = { ...partialProgress, capturedPhotoSlotKeys: REQUIRED_PHOTO_SLOT_KEYS }
    expect(isPickupInspectionComplete(fullProgress)).toBe(true)
    expect(missingRequiredPhotoSlots(REQUIRED_PHOTO_SLOT_KEYS)).toEqual([])
  })

  // Not covered here, deliberately: actually driving a phone camera
  // through the real capture UI and confirming the uploaded bytes land
  // in Storage. See docs/rental-scenario-test-suite.md's Tier B note.
})

describe("Scenario 4 — Return with no damage", () => {
  it("a clean return completes and its deposit is returned in full", async () => {
    const { REQUIRED_PHOTO_SLOT_KEYS } = await import("@/lib/inspections/photo-slots")
    const { isReturnInspectionComplete } = await import("@/lib/inspections/rules")
    const { computeDepositStatus, depositHeldMad } = await import("@/lib/deposits")

    const progress = {
      odometerKm: 41500,
      pickupOdometerKm: 41250,
      fuelLevel: "full" as const,
      capturedPhotoSlotKeys: REQUIRED_PHOTO_SLOT_KEYS,
    }
    expect(isReturnInspectionComplete(progress)).toBe(true)

    // Collected 2000 MAD, nothing retained, all handed back.
    expect(computeDepositStatus(2000, 2000, 2000, 0)).toBe("returned")
    expect(depositHeldMad({ collectedMad: 2000, returnedMad: 2000, retainedMad: 0 })).toBe(0)
  })
})

describe("Scenario 5 — Return with suspected damage", () => {
  it("partial deposit retention leaves the rest held, and the retain amount can never exceed what was collected", async () => {
    const { computeDepositStatus, depositHeldMad, exceedsCollected } = await import("@/lib/deposits")

    // Collected 2000, 500 retained for a scratched bumper, 1500 returned.
    expect(computeDepositStatus(2000, 2000, 1500, 500)).toBe("partially_returned")
    expect(depositHeldMad({ collectedMad: 2000, returnedMad: 1500, retainedMad: 500 })).toBe(0)

    // An employee mistyping a retain amount larger than what was ever
    // collected is caught before it ever reaches the database (mirrors
    // the deposits table's own check constraint — see lib/deposits.ts).
    expect(exceedsCollected(2000, 1500, 600)).toBe(true)
    expect(exceedsCollected(2000, 1500, 500)).toBe(false)
  })

  // Not covered here, deliberately: the AI pickup/return photo
  // comparison itself (lib/damage-detection.ts#compareInspectionPhotos)
  // makes a real vision-model call and can't run without spending real
  // API credits — see docs/rental-scenario-test-suite.md's Tier B note.
  // What's proven above is the deposit-math consequence once a human
  // (or an AI suggestion a human confirmed) has recorded the damage.
})

describe("Scenario 6 — Outstanding balance", () => {
  it("mirrors the exact partial/paid/unpaid branches the reservation list derives payment.status from", async () => {
    const { paymentStatusFor } = await import("@/lib/data")

    // Total due 3000, 2000 paid so far -> 1000 still owed.
    expect(paymentStatusFor(3000, 2000, 1000)).toBe("partial")
    // Fully settled.
    expect(paymentStatusFor(3000, 3000, 0)).toBe("paid")
    // Nothing paid yet.
    expect(paymentStatusFor(3000, 0, 3000)).toBe("unpaid")
  })
})

describe("Scenario 7 — Deposit retention", () => {
  it("walks a deposit through its real lifecycle: expected -> collected -> partially retained", async () => {
    const { computeDepositStatus } = await import("@/lib/deposits")

    expect(computeDepositStatus(1000, 0, 0, 0)).toBe("expected")
    expect(computeDepositStatus(1000, 1000, 0, 0)).toBe("collected")
    expect(computeDepositStatus(1000, 1000, 700, 300)).toBe("partially_returned")
    // Nothing at all returned yet, fully retained.
    expect(computeDepositStatus(1000, 1000, 0, 1000)).toBe("retained")
  })
})

describe("Scenario 8 — Rental extension", () => {
  it("the generic edit action correctly refuses to change dates on an active rental — and no other path exists", async () => {
    reservationFixture.rows = [{ id: "res_active_1", company_id: "co_atlas", status: "active" }]

    const { updateReservation } = await import("@/app/(dashboard)/reservations/actions")
    const result = await updateReservation("res_active_1", {}, new FormData())

    expect(result.error).toBe("A active reservation can't be edited this way.")
  })

  // Real product gap, not a wave-8 regression — recorded here rather
  // than silently assumed away: `rental_extended` is a real, reserved
  // activity_log event type (types/rental.ts's ACTIVITY_TYPES, seeded
  // since the original event-backbone migration) that no code path has
  // ever emitted. types/rental.ts's own comment says as much: "still
  // reserved, unused vocabulary — [no] rental-extension feature exists
  // yet." A rental company hitting this scenario today has no supported
  // way to push an active rental's return date out — only to let it run
  // over (becoming overdue) or complete it and start a fresh booking.
})

describe("Scenario 9 — Vehicle exchange", () => {
  it("the generic edit action refuses to swap the assigned vehicle on an active rental either", async () => {
    reservationFixture.rows = [{ id: "res_active_2", company_id: "co_atlas", status: "active" }]

    const { updateReservation } = await import("@/app/(dashboard)/reservations/actions")
    const result = await updateReservation("res_active_2", {}, new FormData())

    expect(result.error).toBe("A active reservation can't be edited this way.")
  })

  // Same real gap as scenario 8, one step further: there isn't even a
  // reserved-but-unbuilt vocabulary for this one (no
  // "vehicle_exchanged"/"vehicle_reassigned" activity type exists at
  // all). A mid-rental vehicle swap (broken-down car, customer upgrade)
  // has no supported flow today.
})

describe("Scenario 10 — Cancellation", () => {
  it("a pending/confirmed booking can be cancelled; an active rental cannot be — by design, not by bug", async () => {
    const { canTransition } = await import("@/lib/reservations/status")

    expect(canTransition("confirmed", "cancelled")).toBe(true)
    expect(canTransition("pending", "cancelled")).toBe(true)
    // Matches lib/reservations/status.ts's own documented rule: once a
    // rental is active, the only way out is the guided return flow
    // (completing it), never a plain cancel.
    expect(canTransition("active", "cancelled")).toBe(false)
  })
})

describe("Scenario 11 — No-show", () => {
  it("only a confirmed booking can be marked no-show — one that was never confirmed can't have 'failed to show up'", async () => {
    const { canTransition } = await import("@/lib/reservations/status")

    expect(canTransition("confirmed", "no_show")).toBe(true)
    expect(canTransition("pending", "no_show")).toBe(false)
    expect(canTransition("request", "no_show")).toBe(false)
  })
})

describe("Scenario 12 — Document expiry", () => {
  it("flags a licence expiring soon and one already overdue, but not one still far out", async () => {
    const { isWithinWarningWindow } = await import("@/lib/alerts")

    const now = new Date("2026-08-01T00:00:00Z").getTime()
    const warningDays = 30

    // Expires in 5 days -> due soon, alert fires.
    expect(isWithinWarningWindow("2026-08-06", warningDays, now)).toBe(true)
    // Expired 3 days ago -> still very much worth alerting on.
    expect(isWithinWarningWindow("2026-07-29", warningDays, now)).toBe(true)
    // Expires in 90 days -> outside this company's warning window.
    expect(isWithinWarningWindow("2026-10-30", warningDays, now)).toBe(false)
  })
})

describe("Scenario 13 — Offline interruption", () => {
  it("keeps a dependent mutation blocked until its prerequisite resolves, and treats a replayed completion as success, not a conflict", async () => {
    const { isMutationReady, isAlreadyAppliedMessage } = await import("@/lib/offline/sync")

    // A return-inspection completion queued while offline, and a damage-
    // photo attach mutation that depends on the inspection existing.
    const allMutations = [{ id: "complete-return-1" }, { id: "attach-damage-photo-1" }]
    const doneIds = new Set<string>()

    // Nothing has synced yet -> the dependent mutation must wait.
    expect(isMutationReady(["complete-return-1"], allMutations, doneIds)).toBe(false)

    doneIds.add("complete-return-1")
    // Now that its prerequisite is done, it's clear to run.
    expect(isMutationReady(["complete-return-1"], allMutations, doneIds)).toBe(true)

    // Device comes back online after a flaky connection and replays a
    // completion the server actually already applied on a prior attempt
    // whose response never reached the device — this must be treated as
    // a harmless replay, not routed to 'needs_review' for a human to
    // untangle.
    expect(isAlreadyAppliedMessage("This inspection was already completed.")).toBe(true)
    // A genuinely different rejection must NOT be swallowed the same way.
    expect(isAlreadyAppliedMessage("You don't have permission to do this.")).toBe(false)
  })
})

describe("Scenario 14 — Staff restricted from finance", () => {
  it("agents and operational-only roles can't record payments or approve refunds by default", async () => {
    const { hasPermission } = await import("@/lib/permissions/resolve")

    // Role defaults transcribed directly from docs/permissions.md's own
    // table (the authoritative source `role_permission_defaults` seeds
    // from) — not re-invented here.
    const agentDefaults = ["view_customers", "view_reservations", "view_financial_reports", "edit_customers", "edit_reservations"]
    const driverDefaults = ["view_assigned_deliveries"]
    const accountantDefaults = ["view_customers", "view_reservations", "view_financial_reports", "record_payments"]

    expect(hasPermission("record_payments", agentDefaults, [])).toBe(false)
    expect(hasPermission("approve_refunds", agentDefaults, [])).toBe(false)
    expect(hasPermission("view_financial_reports", driverDefaults, [])).toBe(false)
    // An accountant is exactly the "can touch money, can't approve a
    // refund" shape — proves this isn't just "financial roles get
    // everything financial."
    expect(hasPermission("record_payments", accountantDefaults, [])).toBe(true)
    expect(hasPermission("approve_refunds", accountantDefaults, [])).toBe(false)
  })

  it("a non-expired owner-granted override still beats the role default (an agent temporarily trusted with payments)", async () => {
    const { hasPermission } = await import("@/lib/permissions/resolve")
    const agentDefaults = ["view_customers", "view_reservations", "view_financial_reports"]
    const override = { permissionKey: "record_payments", allowed: true, expiresAt: null, createdAt: "2026-08-01T00:00:00Z" }

    expect(hasPermission("record_payments", agentDefaults, [override])).toBe(true)
  })

  it("recordPayment's own role gate rejects a driver session outright, independent of the permission engine", async () => {
    // Real defense in depth: even before has_permission() is consulted,
    // app/(dashboard)/payments/actions.ts#recordPayment gates on
    // PAYMENT_ROLES = ["owner", "manager", "agent", "accountant"] via
    // requireRole(). Constructed by hand here (that const isn't
    // exported) rather than driving the mock session, which is always
    // pinned to "owner" under vitest (lib/mock/company.ts) and so can't
    // itself simulate a driver's request.
    const { requireRole, ActionError } = await import("@/lib/auth/guard")
    const { currentCompany } = await import("@/lib/mock/company")

    const driverSession = {
      userId: "user-driver",
      email: "driver@example.com",
      profile: { fullName: "Driver", avatarPath: null, phone: null, preferredLanguage: "en" },
      company: currentCompany,
      role: "driver" as const,
    }

    expect(() => requireRole(driverSession, ["owner", "manager", "agent", "accountant"])).toThrow(ActionError)
  })
})

describe("Scenario 15 — Wrong-company user attempts access", () => {
  it("updateReservation's own company_id filter makes a cross-company reservation id resolve to 'not found', never a status leak", async () => {
    reservationFixture.rows = [{ id: "res_company_b", company_id: "co_other", status: "confirmed" }]

    // The mock session (lib/mock/company.ts) is always company "co_atlas"
    // — the fixture above deliberately seeds the target row under a
    // different company_id, exactly mirroring a real cross-tenant
    // attempt where the caller's own session company never matches the
    // row's actual company.
    const { updateReservation } = await import("@/app/(dashboard)/reservations/actions")
    const result = await updateReservation("res_company_b", {}, new FormData())

    expect(result.error).toBe("Reservation not found.")
  })

  // This is one narrow, newly-added slice of a much larger existing
  // guarantee. The real, repeatable scripts for this scenario already
  // exist and shouldn't be duplicated here:
  //  - lib/__tests__/cross-tenant-isolation.test.ts — proves the
  //    application-layer query functions behind customer_intelligence,
  //    vehicle_intelligence, operations_feed_items, activity_log,
  //    contract_template_versions, getTeamMembers, and
  //    approval_requests never return another company's row.
  //  - scripts/phase6-tenant-isolation.ts — the live-Postgres version:
  //    two real companies, real anon-key sessions, real cross-company
  //    read/write attempts against vehicles/customers/reservations/
  //    payments/documents/contracts, run with
  //    `npx tsx scripts/phase6-tenant-isolation.ts`. See docs/security.md's
  //    "Cross-tenant isolation testing" section for what it already
  //    covers and how to re-run it.
})
