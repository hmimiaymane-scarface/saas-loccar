import { describe, expect, it } from "vitest"

import { assessReturningCustomerReadiness } from "@/lib/customer-readiness"

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
