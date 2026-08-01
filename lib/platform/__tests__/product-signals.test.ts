import { describe, expect, it } from "vitest"

import { PRODUCT_SIGNAL_TYPES, productSignalPriority } from "../product-signals"

describe("PRODUCT_SIGNAL_TYPES", () => {
  it("has exactly 8 signal types, matching the phase brief and the table's CHECK constraint", () => {
    expect(PRODUCT_SIGNAL_TYPES).toHaveLength(8)
  })

  it("has unique keys", () => {
    const keys = PRODUCT_SIGNAL_TYPES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe("productSignalPriority", () => {
  it("is impact times frequency", () => {
    expect(productSignalPriority(3, 3)).toBe(9)
    expect(productSignalPriority(1, 1)).toBe(1)
    expect(productSignalPriority(2, 3)).toBe(6)
  })

  it("ranks a frequent-but-minor signal below a rare-but-major one when their product is higher", () => {
    // "Repeats every time, barely matters" (1 impact x 3 frequency = 3)
    // vs "matters a lot even if it's rare" (3 impact x 1 frequency = 3) — equal here,
    // but a significant+frequent issue must clearly outrank both.
    const minorButFrequent = productSignalPriority(1, 3)
    const majorButRare = productSignalPriority(3, 1)
    const significantAndFrequent = productSignalPriority(3, 3)
    expect(significantAndFrequent).toBeGreaterThan(minorButFrequent)
    expect(significantAndFrequent).toBeGreaterThan(majorButRare)
  })
})
