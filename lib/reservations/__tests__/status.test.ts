import { describe, expect, it } from "vitest"

import { allowedNextStatuses, canTransition, isTerminalStatus, isEditableStatus } from "../status"

describe("canTransition", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransition("request", "pending")).toBe(true)
    expect(canTransition("request", "confirmed")).toBe(true)
    expect(canTransition("pending", "confirmed")).toBe(true)
  })

  it("allows cancelling from any non-terminal, non-active status", () => {
    expect(canTransition("request", "cancelled")).toBe(true)
    expect(canTransition("pending", "cancelled")).toBe(true)
    expect(canTransition("confirmed", "cancelled")).toBe(true)
  })

  it("rejects skipping straight from request to active — activation is gated, not a generic transition", () => {
    expect(canTransition("request", "active")).toBe(false)
    expect(canTransition("confirmed", "active")).toBe(false)
  })

  it("rejects moving backwards (e.g. active back to confirmed)", () => {
    expect(canTransition("active", "confirmed")).toBe(false)
  })

  it("rejects any transition out of a terminal status", () => {
    expect(canTransition("completed", "active")).toBe(false)
    expect(canTransition("cancelled", "request")).toBe(false)
    expect(canTransition("no_show", "confirmed")).toBe(false)
  })

  it("only allows no_show from confirmed", () => {
    expect(canTransition("confirmed", "no_show")).toBe(true)
    expect(canTransition("pending", "no_show")).toBe(false)
    expect(canTransition("active", "no_show")).toBe(false)
  })

  it("rejects completing a rental as a generic transition — completion is gated through complete_rental()", () => {
    expect(canTransition("active", "completed")).toBe(false)
  })

  it("rejects cancelling an active rental through the ordinary cancel action", () => {
    expect(canTransition("active", "cancelled")).toBe(false)
  })
})

describe("allowedNextStatuses / isTerminalStatus", () => {
  it("reports no further transitions for terminal statuses", () => {
    expect(allowedNextStatuses("completed")).toEqual([])
    expect(allowedNextStatuses("cancelled")).toEqual([])
    expect(allowedNextStatuses("no_show")).toEqual([])
    expect(isTerminalStatus("completed")).toBe(true)
    expect(isTerminalStatus("cancelled")).toBe(true)
    expect(isTerminalStatus("no_show")).toBe(true)
  })

  it("reports live statuses as non-terminal", () => {
    expect(isTerminalStatus("request")).toBe(false)
    expect(isTerminalStatus("pending")).toBe(false)
    expect(isTerminalStatus("confirmed")).toBe(false)
  })

  it("does not report 'active' as terminal, even though it has no generic outbound transition", () => {
    // Active has no entry in RESERVATION_STATUS_TRANSITIONS (completing a
    // rental is gated through complete_rental(), not a generic
    // transition), but it is very much not a dead end — it still becomes
    // "completed" via the guided return flow. isTerminalStatus must not
    // conflate "no generic transition" with "nothing more can happen".
    expect(allowedNextStatuses("active")).toEqual([])
    expect(isTerminalStatus("active")).toBe(false)
  })
})

describe("isEditableStatus", () => {
  it("allows editing while a reservation is still being set up", () => {
    expect(isEditableStatus("request")).toBe(true)
    expect(isEditableStatus("pending")).toBe(true)
    expect(isEditableStatus("confirmed")).toBe(true)
  })

  it("blocks editing once a rental is active — changes go through the guided return flow instead", () => {
    expect(isEditableStatus("active")).toBe(false)
  })

  it("blocks editing for terminal statuses", () => {
    expect(isEditableStatus("completed")).toBe(false)
    expect(isEditableStatus("cancelled")).toBe(false)
    expect(isEditableStatus("no_show")).toBe(false)
  })
})
