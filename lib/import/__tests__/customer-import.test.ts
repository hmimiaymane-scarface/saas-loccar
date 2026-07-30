import { describe, expect, it } from "vitest"

import { validateCustomerImportRow, validateCustomerImportRows, type CustomerImportRawRow } from "../customer-import"
import type { ExistingCustomerRecord } from "@/lib/customer-matching"

const VALID_ROW: CustomerImportRawRow = {
  fullName: "Ahmed Tazi",
  phone: "+212 662-897431",
}

describe("validateCustomerImportRow", () => {
  it("accepts a minimal valid row", () => {
    const result = validateCustomerImportRow(1, VALID_ROW, [])
    expect(result.errors).toEqual([])
    expect(result.data).toMatchObject({ fullName: "Ahmed Tazi", phone: "+212 662-897431", email: null })
    expect(result.isDuplicate).toBe(false)
  })

  it("requires full name and phone", () => {
    const noName = validateCustomerImportRow(1, { ...VALID_ROW, fullName: "" }, [])
    expect(noName.errors).toContain("Full name is required.")
    expect(noName.data).toBeNull()

    const noPhone = validateCustomerImportRow(1, { ...VALID_ROW, phone: "" }, [])
    expect(noPhone.errors).toContain("Phone is required.")
  })

  it("rejects an unparseable date of birth / licence expiry", () => {
    const result = validateCustomerImportRow(1, { ...VALID_ROW, dateOfBirth: "not a date" }, [])
    expect(result.errors.some((e) => e.startsWith("Date of birth:"))).toBe(true)
  })

  it("flags a likely duplicate against the existing pool by phone + name", () => {
    const pool: ExistingCustomerRecord[] = [
      { id: "cus_1", fullName: "Ahmed Tazi", phone: "+212662897431" },
    ]
    const result = validateCustomerImportRow(1, VALID_ROW, pool)
    expect(result.isDuplicate).toBe(true)
    expect(result.duplicateMatches[0].customerId).toBe("cus_1")
    // Still parses -- a duplicate is a warning, not a validation error.
    expect(result.data).not.toBeNull()
  })

  it("does not flag a weak signal alone (shared name only) as a likely duplicate", () => {
    const pool: ExistingCustomerRecord[] = [{ id: "cus_1", fullName: "Ahmed Tazi" }]
    const result = validateCustomerImportRow(1, { fullName: "Ahmed Tazi", phone: "+212 600-000000" }, pool)
    expect(result.isDuplicate).toBe(false)
  })
})

describe("validateCustomerImportRows", () => {
  it("flags the second of two rows describing the same person as an intra-file duplicate", () => {
    const results = validateCustomerImportRows(
      [
        { fullName: "Ahmed Tazi", phone: "+212 662-897431" },
        { fullName: "Ahmed Tazi", phone: "+212662897431" },
      ],
      []
    )
    expect(results[0].isDuplicate).toBe(false)
    expect(results[1].isDuplicate).toBe(true)
  })

  it("does not let an invalid row poison a later valid row's dedup pool", () => {
    const results = validateCustomerImportRows(
      [
        { fullName: "", phone: "+212 662-897431" },
        { fullName: "Ahmed Tazi", phone: "+212 662-897431" },
      ],
      []
    )
    expect(results[0].data).toBeNull()
    expect(results[1].isDuplicate).toBe(false)
  })

  it("assigns 1-based row numbers matching each row's position in the file", () => {
    const results = validateCustomerImportRows([VALID_ROW, VALID_ROW], [])
    expect(results.map((r) => r.rowNumber)).toEqual([1, 2])
  })
})
