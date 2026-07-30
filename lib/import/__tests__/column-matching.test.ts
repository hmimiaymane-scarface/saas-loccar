import { describe, expect, it } from "vitest"

import { suggestColumnMapping, normalizeHeader, VEHICLE_IMPORT_FIELDS, CUSTOMER_IMPORT_FIELDS } from "../column-matching"

describe("normalizeHeader", () => {
  it("lowercases, collapses punctuation/underscores to spaces, and trims", () => {
    expect(normalizeHeader("Daily Rate (MAD)")).toBe("daily rate mad")
    expect(normalizeHeader("registration_number")).toBe("registration number")
    expect(normalizeHeader("  Plate  ")).toBe("plate")
  })
})

describe("suggestColumnMapping", () => {
  it("matches exact field labels", () => {
    const mapping = suggestColumnMapping(["Make", "Model", "Year"], VEHICLE_IMPORT_FIELDS)
    expect(mapping.make).toBe(0)
    expect(mapping.model).toBe(1)
    expect(mapping.year).toBe(2)
  })

  it("matches this app's own fleet-export headers (a re-import of an export auto-maps)", () => {
    const mapping = suggestColumnMapping(
      ["Make", "Model", "Year", "Plate", "Category", "Status", "Daily rate (MAD)", "Odometer (km)"],
      VEHICLE_IMPORT_FIELDS
    )
    expect(mapping.registrationNumber).toBe(3)
    expect(mapping.category).toBe(4)
    expect(mapping.dailyRate).toBe(6)
    expect(mapping.odometerKm).toBe(7)
  })

  it("matches this app's own customer-export headers", () => {
    const mapping = suggestColumnMapping(
      ["Full name", "Phone", "Email", "Licence number", "Licence expires", "Total bookings"],
      CUSTOMER_IMPORT_FIELDS
    )
    expect(mapping.fullName).toBe(0)
    expect(mapping.phone).toBe(1)
    expect(mapping.email).toBe(2)
    expect(mapping.licenseNumber).toBe(3)
    expect(mapping.licenseExpiresOn).toBe(4)
  })

  it("matches via an alias, not just the canonical label", () => {
    const mapping = suggestColumnMapping(["License Plate", "Brand", "Mobile"], [
      ...VEHICLE_IMPORT_FIELDS,
      ...CUSTOMER_IMPORT_FIELDS,
    ])
    expect(mapping.registrationNumber).toBe(0)
    expect(mapping.make).toBe(1)
    expect(mapping.phone).toBe(2)
  })

  it("leaves a field unmapped (null) when no header matches", () => {
    const mapping = suggestColumnMapping(["Make", "Model"], VEHICLE_IMPORT_FIELDS)
    expect(mapping.registrationNumber).toBeNull()
    expect(mapping.dailyRate).toBeNull()
  })

  it("never assigns the same header index to two different fields, even with an ambiguous duplicate header", () => {
    const mapping = suggestColumnMapping(["Phone", "Phone"], CUSTOMER_IMPORT_FIELDS)
    // "Phone" only matches the phone field's own label/aliases — the
    // second "Phone" column has nothing else to match, so it's simply
    // never claimed by anyone.
    expect(mapping.phone).toBe(0)
    const claimedIndexes = Object.values(mapping).filter((v) => v !== null)
    expect(new Set(claimedIndexes).size).toBe(claimedIndexes.length)
  })

  it("is case- and punctuation-insensitive", () => {
    const mapping = suggestColumnMapping(["FULL_NAME", "phone number"], CUSTOMER_IMPORT_FIELDS)
    expect(mapping.fullName).toBe(0)
    expect(mapping.phone).toBe(1)
  })
})
