import { describe, expect, it } from "vitest"

import { callAndOpenActions } from "../actions"

describe("callAndOpenActions", () => {
  it("always includes the open action", () => {
    const actions = callAndOpenActions(null, "Open rental", "/reservations/1")
    expect(actions).toContainEqual({ label: "Open rental", href: "/reservations/1", kind: "link" })
  })

  it("includes a call action when a real phone number is on file", () => {
    const actions = callAndOpenActions("+212600000000", "Open rental", "/reservations/1")
    expect(actions).toContainEqual({ label: "Call customer", href: "tel:+212600000000", kind: "call" })
    expect(actions).toHaveLength(2)
  })

  it("never fabricates a call action without a real phone number — no dead buttons", () => {
    expect(callAndOpenActions(null, "Open rental", "/reservations/1")).toHaveLength(1)
    expect(callAndOpenActions(undefined, "Open rental", "/reservations/1")).toHaveLength(1)
    expect(callAndOpenActions("", "Open rental", "/reservations/1")).toHaveLength(1)
  })

  it("is never empty", () => {
    expect(callAndOpenActions(null, "Open X", "/x").length).toBeGreaterThan(0)
    expect(callAndOpenActions("+1", "Open X", "/x").length).toBeGreaterThan(0)
  })
})
