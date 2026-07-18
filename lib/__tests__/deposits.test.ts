import { describe, expect, it } from "vitest"

import { computeDepositStatus, depositHeldMad, exceedsCollected } from "../deposits"

describe("computeDepositStatus", () => {
  it("is not_required when nothing is expected or collected", () => {
    expect(computeDepositStatus(0, 0, 0, 0)).toBe("not_required")
  })

  it("is expected when a deposit is due but nothing has been collected yet", () => {
    expect(computeDepositStatus(1000, 0, 0, 0)).toBe("expected")
  })

  it("is partially_collected when less than the expected amount has come in", () => {
    expect(computeDepositStatus(1000, 400, 0, 0)).toBe("partially_collected")
  })

  it("is collected once the full expected amount is in and nothing has been resolved", () => {
    expect(computeDepositStatus(1000, 1000, 0, 0)).toBe("collected")
  })

  it("is collected even without an expected amount on file (collected >= expected when expected is 0)", () => {
    expect(computeDepositStatus(0, 500, 0, 0)).toBe("collected")
  })

  it("is partially_returned once some but not all of the collected amount has been resolved", () => {
    expect(computeDepositStatus(1000, 1000, 300, 0)).toBe("partially_returned")
    expect(computeDepositStatus(1000, 1000, 0, 300)).toBe("partially_returned")
  })

  it("is partially_returned when fully resolved through a mix of returned and retained", () => {
    expect(computeDepositStatus(1000, 1000, 700, 300)).toBe("partially_returned")
  })

  it("is returned when the full amount came back with nothing retained", () => {
    expect(computeDepositStatus(1000, 1000, 1000, 0)).toBe("returned")
  })

  it("is retained when the full amount was kept with nothing returned", () => {
    expect(computeDepositStatus(1000, 1000, 0, 1000)).toBe("retained")
  })
})

describe("depositHeldMad", () => {
  it("is the collected amount minus whatever has been returned or retained", () => {
    expect(depositHeldMad({ collectedMad: 1000, returnedMad: 700, retainedMad: 300 })).toBe(0)
    expect(depositHeldMad({ collectedMad: 1500, returnedMad: 0, retainedMad: 0 })).toBe(1500)
  })
})

describe("exceedsCollected", () => {
  it("mirrors the deposits table's check constraint: returned + retained must not exceed collected", () => {
    expect(exceedsCollected(1000, 700, 300)).toBe(false)
    expect(exceedsCollected(1000, 700, 301)).toBe(true)
    expect(exceedsCollected(1000, 1000, 1)).toBe(true)
  })
})
