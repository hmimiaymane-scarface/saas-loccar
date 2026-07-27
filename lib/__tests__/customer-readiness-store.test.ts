import { describe, expect, it } from "vitest"

import { getUpcomingReservationsMissingIdentityDocument } from "../customer-readiness-store"

describe("getUpcomingReservationsMissingIdentityDocument", () => {
  it("returns empty when supabase is unavailable (mock mode)", async () => {
    const flags = await getUpcomingReservationsMissingIdentityDocument(null, "co_1")
    expect(flags).toHaveLength(0)
  })
})
