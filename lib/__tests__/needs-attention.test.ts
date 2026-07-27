import { describe, expect, it } from "vitest"

import { buildNeedsAttentionFeed, type NeedsAttentionInput } from "../needs-attention"
import type { LiveAlert, Booking } from "@/types/rental"
import type { OperationsFeedItem } from "@/lib/operations-feed/data"

function baseInput(overrides: Partial<NeedsAttentionInput> = {}): NeedsAttentionInput {
  return {
    alerts: [],
    feedItems: [],
    bookingRequests: [],
    contractsAwaitingSignature: [],
    missingDocuments: [],
    ...overrides,
  }
}

function alert(overrides: Partial<LiveAlert> = {}): LiveAlert {
  return {
    key: "alert_1",
    type: "rental_overdue",
    urgency: "overdue",
    title: "Rental overdue",
    description: "Ahmed Tazi's rental is overdue for return.",
    href: "/reservations/res_1",
    dueDate: null,
    actions: [{ label: "Call customer", href: "tel:+212600000000", kind: "call" }],
    ...overrides,
  }
}

function feedItem(overrides: Partial<OperationsFeedItem> = {}): OperationsFeedItem {
  return {
    id: "feed_1",
    observerType: "missing_handoff_photos",
    entityType: "reservation",
    entityId: "res_2",
    priorityTier: "operational",
    observation: "Pickup missing photos",
    reasoning: "The fuel gauge photo wasn't captured.",
    suggestedAction: "Add it before the customer leaves.",
    actionLabel: "Add photo",
    actionHref: "/reservations/res_2/pickup",
    confidence: "high",
    firstDetectedAt: "2026-07-27T09:00:00Z",
    lastSeenAt: "2026-07-27T09:00:00Z",
    ...overrides,
  }
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "res_3",
    reference: "RB-3",
    customer: { id: "cus_1", fullName: "Sara Bennis", phone: "+212600000001" },
    vehicle: { id: "veh_1", make: "Dacia", model: "Duster", plate: "A-123", category: "suv" },
    requestedCategory: null,
    startDate: "2026-07-28",
    endDate: "2026-07-30",
    pickupLocation: "Marrakech",
    returnLocation: "Marrakech",
    status: "request",
    isOverdue: false,
    payment: { status: "unpaid", totalDueMad: 1000, amountPaidMad: 0, remainingMad: 1000 },
    createdAt: "2026-07-27T08:00:00Z",
    ...overrides,
  }
}

describe("buildNeedsAttentionFeed", () => {
  it("sorts critical before operational before important", () => {
    const cards = buildNeedsAttentionFeed(
      baseInput({
        alerts: [alert({ key: "a_due_soon", urgency: "due_soon" }), alert({ key: "a_overdue", urgency: "overdue" })],
        feedItems: [feedItem({ priorityTier: "operational" })],
      })
    )

    expect(cards.map((c) => c.priority)).toEqual(["critical", "operational", "important"])
  })

  it("gives every card a real action, never a bare fact", () => {
    const cards = buildNeedsAttentionFeed(
      baseInput({
        alerts: [alert()],
        bookingRequests: [booking()],
        contractsAwaitingSignature: [{ id: "con_1", contractNumber: "C-1", customerName: "Ahmed Tazi", vehicleLabel: "Dacia Duster" }],
        missingDocuments: [{ customerId: "cus_2", customerName: "Youssef Idrissi", reservationId: "res_4", pickupAt: "2026-07-28T10:00:00Z" }],
      })
    )

    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.actionLabel.length).toBeGreaterThan(0)
      expect(card.actionHref.length).toBeGreaterThan(0)
    }
  })

  it("only marks operations-feed-sourced cards as dismissible", () => {
    const cards = buildNeedsAttentionFeed(
      baseInput({
        alerts: [alert()],
        feedItems: [feedItem()],
        bookingRequests: [booking()],
      })
    )

    const byId = Object.fromEntries(cards.map((c) => [c.id, c.dismissible]))
    expect(byId["alert_1"]).toBe(false)
    expect(byId["feed_1"]).toBe(true)
    expect(byId["booking-request:res_3"]).toBe(false)
  })

  it("excludes business_health and informational tier feed items — those stay in Opportunities", () => {
    const cards = buildNeedsAttentionFeed(
      baseInput({
        feedItems: [feedItem({ id: "feed_business", priorityTier: "business_health" }), feedItem({ id: "feed_info", priorityTier: "informational" })],
      })
    )

    expect(cards).toHaveLength(0)
  })

  it("links a booking request to the reservation page where the real Confirm/Decline actions live", () => {
    const cards = buildNeedsAttentionFeed(baseInput({ bookingRequests: [booking()] }))

    expect(cards[0].actionHref).toBe("/reservations/res_3")
    expect(cards[0].title).toBe("Sara Bennis wants to book")
  })

  it("links a contract awaiting signature to its own signing page", () => {
    const cards = buildNeedsAttentionFeed(
      baseInput({ contractsAwaitingSignature: [{ id: "con_9", contractNumber: null, customerName: "Fatima Alaoui", vehicleLabel: null }] })
    )

    expect(cards[0].actionHref).toBe("/contracts/con_9")
    expect(cards[0].priority).toBe("operational")
  })

  it("flags a missing identity document as critical", () => {
    const cards = buildNeedsAttentionFeed(
      baseInput({
        missingDocuments: [{ customerId: "cus_5", customerName: "Karim Ziani", reservationId: "res_5", pickupAt: "2026-07-28T10:00:00Z" }],
      })
    )

    expect(cards[0].priority).toBe("critical")
    expect(cards[0].actionHref).toBe("/customers/cus_5")
  })
})
