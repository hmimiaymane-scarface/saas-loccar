import { describe, expect, it } from "vitest"

import { allowedNextStatuses, canTransition, isTerminalStatus } from "../status"

describe("canTransition", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransition("request", "pending")).toBe(true)
    expect(canTransition("request", "confirmed")).toBe(true)
    expect(canTransition("pending", "confirmed")).toBe(true)
    expect(canTransition("confirmed", "active")).toBe(true)
    expect(canTransition("active", "completed")).toBe(true)
  })

  it("allows cancelling from any non-terminal status", () => {
    expect(canTransition("request", "cancelled")).toBe(true)
    expect(canTransition("pending", "cancelled")).toBe(true)
    expect(canTransition("confirmed", "cancelled")).toBe(true)
    expect(canTransition("active", "cancelled")).toBe(true)
  })

  it("rejects skipping straight from request to active", () => {
    expect(canTransition("request", "active")).toBe(false)
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
    expect(isTerminalStatus("active")).toBe(false)
  })
})
