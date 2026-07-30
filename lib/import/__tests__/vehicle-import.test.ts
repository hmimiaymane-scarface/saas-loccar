import { describe, expect, it } from "vitest"

import { validateVehicleImportRow, validateVehicleImportRows, type VehicleImportRawRow } from "../vehicle-import"

const VALID_ROW: VehicleImportRawRow = {
  registrationNumber: "12345-A-6",
  make: "Toyota",
  model: "Yaris",
  year: "2023",
  category: "economy",
  dailyRate: "300",
}

describe("validateVehicleImportRow", () => {
  it("accepts a minimal valid row and defaults fuelType/transmission/odometer", () => {
    const result = validateVehicleImportRow(1, VALID_ROW, new Set(), new Set())
    expect(result.errors).toEqual([])
    expect(result.data).toMatchObject({
      registrationNumber: "12345-A-6",
      make: "Toyota",
      model: "Yaris",
      year: 2023,
      category: "economy",
      dailyRate: 300,
      fuelType: "petrol",
      transmission: "manual",
      odometerKm: 0,
    })
  })

  it("accepts case-insensitive enum values", () => {
    const result = validateVehicleImportRow(1, { ...VALID_ROW, category: "SUV", fuelType: "Diesel", transmission: "AUTOMATIC" }, new Set(), new Set())
    expect(result.errors).toEqual([])
    expect(result.data?.category).toBe("suv")
    expect(result.data?.fuelType).toBe("diesel")
    expect(result.data?.transmission).toBe("automatic")
  })

  it.each([
    ["registrationNumber", "Registration number is required."],
    ["make", "Make is required."],
    ["model", "Model is required."],
  ])("reports a missing required field: %s", (field, expectedError) => {
    const row = { ...VALID_ROW, [field]: "" }
    const result = validateVehicleImportRow(1, row, new Set(), new Set())
    expect(result.errors).toContain(expectedError)
    expect(result.data).toBeNull()
  })

  it("rejects a year outside 1980-2100", () => {
    const result = validateVehicleImportRow(1, { ...VALID_ROW, year: "1899" }, new Set(), new Set())
    expect(result.errors).toContain("Year must be between 1980 and 2100.")
  })

  it("rejects a non-numeric daily rate", () => {
    const result = validateVehicleImportRow(1, { ...VALID_ROW, dailyRate: "free" }, new Set(), new Set())
    expect(result.errors).toContain("Daily rate must be a number.")
  })

  it("rejects a negative daily rate", () => {
    const result = validateVehicleImportRow(1, { ...VALID_ROW, dailyRate: "-50" }, new Set(), new Set())
    expect(result.errors).toContain("Daily rate can't be negative.")
  })

  it("rejects an unrecognized category", () => {
    const result = validateVehicleImportRow(1, { ...VALID_ROW, category: "sports car" }, new Set(), new Set())
    expect(result.errors.some((e) => e.startsWith("Category must be one of"))).toBe(true)
  })

  it("rejects an unparseable expiry date but accepts a flexible format", () => {
    const bad = validateVehicleImportRow(1, { ...VALID_ROW, insuranceExpiresOn: "not a date" }, new Set(), new Set())
    expect(bad.errors.some((e) => e.startsWith("Insurance expiry:"))).toBe(true)

    const good = validateVehicleImportRow(1, { ...VALID_ROW, insuranceExpiresOn: "March 14, 2028" }, new Set(), new Set())
    expect(good.errors).toEqual([])
    expect(good.data?.insuranceExpiresOn).toBe("2028-03-14")
  })

  it("flags a plate matching an existing vehicle as a duplicate", () => {
    const existing = new Set(["12345A6"])
    const result = validateVehicleImportRow(1, VALID_ROW, existing, new Set())
    expect(result.isDuplicate).toBe(true)
    expect(result.duplicateReason).toMatch(/already exists/)
    // Still parses successfully -- duplicate is a warning, not a parse error.
    expect(result.data).not.toBeNull()
  })

  it("normalizes plate formatting (spaces/dashes/case) for duplicate matching", () => {
    const existing = new Set(["12345A6"]) // normalizeIdLike("12345-A-6")
    const result = validateVehicleImportRow(1, { ...VALID_ROW, registrationNumber: "12345 a 6" }, existing, new Set())
    expect(result.isDuplicate).toBe(true)
  })

  it("flags an intra-file duplicate against an already-seen plate", () => {
    const result = validateVehicleImportRow(2, VALID_ROW, new Set(), new Set(["12345A6"]))
    expect(result.isDuplicate).toBe(true)
    expect(result.duplicateReason).toMatch(/earlier in this file/)
  })
})

describe("validateVehicleImportRows", () => {
  it("flags the second of two identical rows as an intra-file duplicate, not the first", () => {
    const results = validateVehicleImportRows([VALID_ROW, VALID_ROW], new Set())
    expect(results[0].isDuplicate).toBe(false)
    expect(results[1].isDuplicate).toBe(true)
    expect(results[1].duplicateReason).toMatch(/earlier in this file/)
  })

  it("does not let an invalid row's plate poison a later valid row's dedup check", () => {
    const invalidRow: VehicleImportRawRow = { ...VALID_ROW, make: "" }
    const results = validateVehicleImportRows([invalidRow, VALID_ROW], new Set())
    expect(results[0].data).toBeNull()
    expect(results[1].isDuplicate).toBe(false)
  })

  it("assigns 1-based row numbers matching each row's position in the file", () => {
    const results = validateVehicleImportRows([VALID_ROW, VALID_ROW, VALID_ROW], new Set())
    expect(results.map((r) => r.rowNumber)).toEqual([1, 2, 3])
  })
})
