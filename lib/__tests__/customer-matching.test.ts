import { describe, expect, it } from "vitest"

import {
  normalizeName,
  nameSimilarity,
  normalizeIdLike,
  scoreCustomerMatch,
  findDuplicateMatches,
  DUPLICATE_SURFACE_THRESHOLD,
  DUPLICATE_LIKELY_THRESHOLD,
  type ExistingCustomerRecord,
} from "@/lib/customer-matching"

describe("normalizeName", () => {
  it("strips diacritics, case, and punctuation, and collapses whitespace", () => {
    expect(normalizeName("Aïcha  Bennani")).toBe("aicha bennani")
    expect(normalizeName("O'Brien-Smith")).toBe("obriensmith")
    expect(normalizeName("  Ahmed   Tazi  ")).toBe("ahmed tazi")
  })
})

describe("normalizeIdLike", () => {
  it("uppercases and strips spaces/dashes", () => {
    expect(normalizeIdLike("ma 204471")).toBe("MA204471")
    expect(normalizeIdLike("MA-204471")).toBe("MA204471")
  })
})

describe("nameSimilarity", () => {
  it("returns 1 for identical (post-normalization) names", () => {
    expect(nameSimilarity("Ahmed Tazi", "ahmed tazi")).toBe(1)
  })

  it("returns 0 for completely different names", () => {
    expect(nameSimilarity("Ahmed Tazi", "Fatima Zahra Alaoui")).toBeLessThan(0.3)
  })

  it("returns a high but non-1 score for a near-miss spelling", () => {
    const sim = nameSimilarity("Ahmed Tazi", "Ahmed Tazzi")
    expect(sim).toBeGreaterThan(0.85)
    expect(sim).toBeLessThan(1)
  })
})

describe("scoreCustomerMatch", () => {
  it("scores an obvious duplicate (same licence number, same name) as a likely duplicate", () => {
    const { confidence, matchedFields } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", licenseNumber: "MA-204471" },
      { id: "cus_2", fullName: "Ahmed Tazi", licenseNumber: "MA204471" }
    )
    expect(confidence).toBeGreaterThanOrEqual(DUPLICATE_LIKELY_THRESHOLD)
    expect(matchedFields).toEqual(expect.arrayContaining(["licenseNumber", "fullName"]))
  })

  it("scores two genuinely different customers as no match", () => {
    const { confidence, matchedFields } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", licenseNumber: "MA-204471" },
      { id: "cus_9", fullName: "Fatima Zahra Alaoui", licenseNumber: "MA-999111" }
    )
    expect(confidence).toBe(0)
    expect(matchedFields).toEqual([])
  })

  it("does not treat a near-match-but-different name alone as a confident match", () => {
    const { confidence } = scoreCustomerMatch(
      { fullName: "Mohammed Amrani" },
      { id: "cus_x", fullName: "Mohammed Amraoui" }
    )
    expect(confidence).toBeLessThan(DUPLICATE_SURFACE_THRESHOLD)
  })

  it("surfaces (but does not mark likely) a shared exact name with nothing else in common", () => {
    const { confidence } = scoreCustomerMatch({ fullName: "Ahmed Tazi" }, { id: "cus_y", fullName: "Ahmed Tazi" })
    expect(confidence).toBeGreaterThanOrEqual(DUPLICATE_SURFACE_THRESHOLD)
    expect(confidence).toBeLessThan(DUPLICATE_LIKELY_THRESHOLD)
  })

  it("treats a matching id document number as a strong independent signal even with no name match", () => {
    const { confidence, matchedFields } = scoreCustomerMatch(
      { fullName: "Zzz Unrelated", idDocumentNumber: "AB123456" },
      { id: "cus_z", fullName: "Ahmed Tazi", idDocumentNumber: "ab-123456" }
    )
    expect(matchedFields).toEqual(["idDocumentNumber"])
    expect(confidence).toBeGreaterThan(0)
    expect(confidence).toBeLessThan(DUPLICATE_LIKELY_THRESHOLD)
  })
})

describe("findDuplicateMatches", () => {
  const pool: ExistingCustomerRecord[] = [
    { id: "cus_1", fullName: "Khadija Idrissi", licenseNumber: "MA-118827" },
    { id: "cus_2", fullName: "Ahmed Tazi", licenseNumber: "MA-204471" },
    { id: "cus_3", fullName: "Sara Bennis", licenseNumber: "MA-339021" },
  ]

  it("flags the obvious duplicate and excludes unrelated customers", () => {
    const matches = findDuplicateMatches({ fullName: "Ahmed Tazi", licenseNumber: "MA-204471" }, pool)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ customerId: "cus_2", isLikelyDuplicate: true })
  })

  it("returns no matches for a genuinely new customer", () => {
    const matches = findDuplicateMatches({ fullName: "Youssef El Amrani", licenseNumber: "MA-777000" }, pool)
    expect(matches).toEqual([])
  })

  it("excludes a given customer id even if it would otherwise match", () => {
    const matches = findDuplicateMatches(
      { fullName: "Ahmed Tazi", licenseNumber: "MA-204471" },
      pool,
      "cus_2"
    )
    expect(matches).toEqual([])
  })

  it("sorts multiple matches by descending confidence", () => {
    const twoMatches: ExistingCustomerRecord[] = [
      { id: "weak", fullName: "Ahmed Tazi" }, // name-only match, low confidence
      { id: "strong", fullName: "Ahmed Tazi", licenseNumber: "MA-204471" }, // name + licence
    ]
    const matches = findDuplicateMatches({ fullName: "Ahmed Tazi", licenseNumber: "MA-204471" }, twoMatches)
    expect(matches.map((m) => m.customerId)).toEqual(["strong", "weak"])
  })
})
