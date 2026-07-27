import { describe, expect, it } from "vitest"

import { assessReturningCustomerReadiness, findCustomersMissingIdentityDocument, type UpcomingPickupCustomer } from "@/lib/customer-readiness"

const NOW = new Date("2026-07-21T12:00:00Z")

describe("assessReturningCustomerReadiness", () => {
  it("is ready when licence is valid and an unexpired identity document exists", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: "2027-01-01",
      documents: [{ category: "identity_document", expiresOn: null }],
      now: NOW,
    })
    expect(result).toEqual({ ready: true, issues: [] })
  })

  it("flags a missing licence date", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: null,
      documents: [{ category: "identity_document", expiresOn: null }],
      now: NOW,
    })
    expect(result.ready).toBe(false)
    expect(result.issues).toEqual([{ type: "licence_missing" }])
  })

  it("flags an expired licence with the actual expiry date", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: "2026-01-01",
      documents: [{ category: "identity_document", expiresOn: null }],
      now: NOW,
    })
    expect(result.ready).toBe(false)
    expect(result.issues).toEqual([{ type: "licence_expired", expiresOn: "2026-01-01" }])
  })

  it("flags no identity document on file", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: "2027-01-01",
      documents: [],
      now: NOW,
    })
    expect(result.ready).toBe(false)
    expect(result.issues).toEqual([{ type: "identity_missing" }])
  })

  it("flags an identity document that has expired", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: "2027-01-01",
      documents: [{ category: "identity_document", expiresOn: "2026-06-01" }],
      now: NOW,
    })
    expect(result.ready).toBe(false)
    expect(result.issues).toEqual([{ type: "identity_expired", expiresOn: "2026-06-01" }])
  })

  it("is not expired when at least one of several identity documents is still valid", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: "2027-01-01",
      documents: [
        { category: "identity_document", expiresOn: "2026-06-01" },
        { category: "identity_document", expiresOn: "2028-01-01" },
      ],
      now: NOW,
    })
    expect(result).toEqual({ ready: true, issues: [] })
  })

  it("is not expired when one identity document has no expiry recorded at all", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: "2027-01-01",
      documents: [
        { category: "identity_document", expiresOn: "2026-06-01" },
        { category: "identity_document", expiresOn: null },
      ],
      now: NOW,
    })
    expect(result).toEqual({ ready: true, issues: [] })
  })

  it("reports every issue at once, not just the first", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: null,
      documents: [],
      now: NOW,
    })
    expect(result.ready).toBe(false)
    expect(result.issues).toEqual([{ type: "licence_missing" }, { type: "identity_missing" }])
  })

  it("ignores non-identity documents entirely (e.g. a driving licence scan)", () => {
    const result = assessReturningCustomerReadiness({
      licenseExpiresAt: "2027-01-01",
      documents: [{ category: "driving_licence", expiresOn: "2020-01-01" }],
      now: NOW,
    })
    expect(result.ready).toBe(false)
    expect(result.issues).toEqual([{ type: "identity_missing" }])
  })
})

function pickupCustomer(overrides: Partial<UpcomingPickupCustomer> = {}): UpcomingPickupCustomer {
  return {
    customerId: "cus_1",
    customerName: "Youssef Idrissi",
    reservationId: "res_1",
    pickupAt: "2026-07-22T10:00:00Z",
    licenseExpiresAt: "2027-01-01",
    documents: [],
    ...overrides,
  }
}

describe("findCustomersMissingIdentityDocument — phase 11 Needs-You-Now detector", () => {
  it("flags a customer with an upcoming pickup and no identity document", () => {
    const flags = findCustomersMissingIdentityDocument([pickupCustomer()], NOW)
    expect(flags).toEqual([{ customerId: "cus_1", customerName: "Youssef Idrissi", reservationId: "res_1", pickupAt: "2026-07-22T10:00:00Z" }])
  })

  it("does not flag a customer with a valid identity document", () => {
    const flags = findCustomersMissingIdentityDocument(
      [pickupCustomer({ documents: [{ category: "identity_document", expiresOn: null }] })],
      NOW
    )
    expect(flags).toHaveLength(0)
  })

  it("ignores a licence-only issue — that's a different fix, not a missing document", () => {
    const flags = findCustomersMissingIdentityDocument(
      [pickupCustomer({ licenseExpiresAt: null, documents: [{ category: "identity_document", expiresOn: null }] })],
      NOW
    )
    expect(flags).toHaveLength(0)
  })

  it("dedupes a customer with two upcoming reservations, keeping the soonest pickup", () => {
    const flags = findCustomersMissingIdentityDocument(
      [
        pickupCustomer({ reservationId: "res_later", pickupAt: "2026-07-24T10:00:00Z" }),
        pickupCustomer({ reservationId: "res_sooner", pickupAt: "2026-07-22T09:00:00Z" }),
      ],
      NOW
    )
    expect(flags).toHaveLength(1)
    expect(flags[0].reservationId).toBe("res_sooner")
  })
})
