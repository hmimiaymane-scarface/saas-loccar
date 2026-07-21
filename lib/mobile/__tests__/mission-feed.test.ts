import { describe, expect, it } from "vitest"

import { buildMissionFeed, type MissionReservationInput, type MissionFeedItemInput } from "../mission-feed"

const NOW = "2026-07-21T10:00:00+01:00"

function reservation(overrides: Partial<MissionReservationInput> = {}): MissionReservationInput {
  return {
    id: "res_1",
    reference: "RB-1001",
    customerName: "Ahmed Tazi",
    vehicleLabel: "Hyundai Accent",
    status: "confirmed",
    pickupAt: "2026-07-21T12:00:00+01:00",
    returnAt: "2026-07-25T12:00:00+01:00",
    pickupDueToday: false,
    returnDueToday: false,
    hasPickupInspection: false,
    hasCompletedPickupInspection: false,
    hasCompletedReturnInspection: false,
    contractAwaitingSignature: false,
    ...overrides,
  }
}

describe("buildMissionFeed", () => {
  it("flags an overdue return as critical, ahead of everything else", () => {
    const cards = buildMissionFeed({
      reservations: [
        reservation({ id: "res_overdue", returnDueToday: true, returnAt: "2026-07-21T08:00:00+01:00" }),
        reservation({ id: "res_pickup_soon", pickupDueToday: true, pickupAt: "2026-07-21T11:00:00+01:00" }),
      ],
      feedItems: [],
      nowIso: NOW,
    })

    expect(cards[0]).toMatchObject({ id: "res_overdue-return-overdue", tone: "critical" })
    expect(cards[0].title).toContain("overdue for return")
  })

  it("labels a pickup within 2 hours as 'arriving soon', not just 'scheduled today'", () => {
    const cards = buildMissionFeed({
      reservations: [reservation({ pickupDueToday: true, pickupAt: "2026-07-21T11:30:00+01:00" })],
      feedItems: [],
      nowIso: NOW,
    })

    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Ahmed Tazi is arriving soon")
    expect(cards[0].tone).toBe("operational")
  })

  it("labels a pickup later today (beyond 2 hours) as merely scheduled, informational", () => {
    const cards = buildMissionFeed({
      reservations: [reservation({ pickupDueToday: true, pickupAt: "2026-07-21T17:00:00+01:00" })],
      feedItems: [],
      nowIso: NOW,
    })

    expect(cards).toHaveLength(1)
    expect(cards[0].title).toContain("scheduled for pickup today")
    expect(cards[0].tone).toBe("informational")
  })

  it("surfaces an inspection already started but not finished as 'waiting', not 'arriving soon'", () => {
    const cards = buildMissionFeed({
      reservations: [
        reservation({ pickupDueToday: true, pickupAt: "2026-07-21T10:30:00+01:00", hasPickupInspection: true }),
      ],
      feedItems: [],
      nowIso: NOW,
    })

    expect(cards[0].title).toContain("waiting to be finished")
  })

  it("does not surface a pickup/return card once the corresponding inspection is completed", () => {
    const cards = buildMissionFeed({
      reservations: [
        reservation({
          pickupDueToday: true,
          hasCompletedPickupInspection: true,
          returnDueToday: true,
          hasCompletedReturnInspection: true,
        }),
      ],
      feedItems: [],
      nowIso: NOW,
    })

    expect(cards).toHaveLength(0)
  })

  it("surfaces a contract awaiting signature as its own operational card", () => {
    const cards = buildMissionFeed({
      reservations: [reservation({ contractAwaitingSignature: true })],
      feedItems: [],
      nowIso: NOW,
    })

    expect(cards).toHaveLength(1)
    expect(cards[0].title).toContain("contract is ready to sign")
    expect(cards[0].tone).toBe("operational")
  })

  it("maps operations-feed items through with tone derived from priority tier", () => {
    const feedItems: MissionFeedItemInput[] = [
      { id: "f1", observation: "Vehicle idle 12 days", actionLabel: "Review", actionHref: "/fleet/veh_1", priorityTier: "business_health" },
      { id: "f2", observation: "Licence expiring", actionLabel: "Open", actionHref: "/customers/cus_1", priorityTier: "critical" },
    ]
    const cards = buildMissionFeed({ reservations: [], feedItems, nowIso: NOW })

    expect(cards[0]).toMatchObject({ id: "feed-f2", tone: "critical" })
    expect(cards[1]).toMatchObject({ id: "feed-f1", tone: "informational" })
  })

  it("orders critical before operational before informational, mixing reservation and feed cards", () => {
    const cards = buildMissionFeed({
      reservations: [
        reservation({ id: "res_info", pickupDueToday: true, pickupAt: "2026-07-21T20:00:00+01:00" }),
        reservation({ id: "res_crit", returnDueToday: true, returnAt: "2026-07-21T07:00:00+01:00" }),
      ],
      feedItems: [{ id: "f1", observation: "Opportunity", actionLabel: "Open", actionHref: "/x", priorityTier: "operational" }],
      nowIso: NOW,
    })

    expect(cards.map((c) => c.tone)).toEqual(["critical", "operational", "informational"])
  })

  it("returns an empty list when there is nothing relevant today", () => {
    expect(buildMissionFeed({ reservations: [], feedItems: [], nowIso: NOW })).toEqual([])
  })
})
