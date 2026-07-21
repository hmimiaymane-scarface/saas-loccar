import { describe, expect, it } from "vitest"

import {
  normalizeName,
  nameSimilarity,
  normalizeIdLike,
  normalizePhone,
  normalizeEmail,
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

describe("normalizePhone", () => {
  it("strips everything but digits", () => {
    expect(normalizePhone("+212 661-234567")).toBe("212661234567")
    expect(normalizePhone("212661234567")).toBe("212661234567")
  })
})

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Ahmed.Tazi@Example.com ")).toBe("ahmed.tazi@example.com")
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

  it("scores same name + same phone as a likely duplicate (phase 08 requirement 3)", () => {
    const { confidence, matchedFields } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", phone: "+212 661-234567" },
      { id: "cus_2", fullName: "Ahmed Tazi", phone: "212661234567" }
    )
    expect(confidence).toBeGreaterThanOrEqual(DUPLICATE_LIKELY_THRESHOLD)
    expect(matchedFields).toEqual(expect.arrayContaining(["phone", "fullName"]))
  })

  it("scores same name + same email as a likely duplicate", () => {
    const { confidence, matchedFields } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", email: "Ahmed.Tazi@Example.com" },
      { id: "cus_2", fullName: "Ahmed Tazi", email: "ahmed.tazi@example.com" }
    )
    expect(confidence).toBeGreaterThanOrEqual(DUPLICATE_LIKELY_THRESHOLD)
    expect(matchedFields).toEqual(expect.arrayContaining(["email", "fullName"]))
  })

  // --- False-positive risk cases (phase 08 acceptance criterion: "think
  // about false-positive risk explicitly") ---

  it("surfaces a shared phone alone only for review, never as a confident duplicate — a family/business line can be legitimately reused", () => {
    const { confidence } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", phone: "+212 661-234567" },
      { id: "cus_other", fullName: "Sara Bennis", phone: "212661234567" }
    )
    expect(confidence).toBeGreaterThanOrEqual(DUPLICATE_SURFACE_THRESHOLD)
    expect(confidence).toBeLessThan(DUPLICATE_LIKELY_THRESHOLD)
  })

  it("surfaces a shared email alone only for review, never as a confident duplicate", () => {
    const { confidence } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", email: "family@example.com" },
      { id: "cus_other", fullName: "Sara Bennis", email: "family@example.com" }
    )
    expect(confidence).toBeGreaterThanOrEqual(DUPLICATE_SURFACE_THRESHOLD)
    expect(confidence).toBeLessThan(DUPLICATE_LIKELY_THRESHOLD)
  })

  it("does NOT confidently flag two different people who share only a last name (e.g. father/son)", () => {
    const { confidence } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", phone: "+212 661-234567" }, // shared household phone
      { id: "cus_son", fullName: "Youssef Tazi", phone: "212661234567" }
    )
    // phone (35) alone, name similarity far below the 0.85 floor —
    // surfaced for review at most, never "likely duplicate".
    expect(confidence).toBeLessThan(DUPLICATE_LIKELY_THRESHOLD)
  })

  it("does NOT flag a coincidentally shared birth date alone", () => {
    const { confidence } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", dateOfBirth: "1990-05-14" },
      { id: "cus_other", fullName: "Sara Bennis", dateOfBirth: "1990-05-14" }
    )
    expect(confidence).toBeLessThan(DUPLICATE_SURFACE_THRESHOLD)
  })

  it("surfaces a moderate 'review later' signal (not a likely duplicate) when weak signals stack without a name match", () => {
    const { confidence, matchedFields } = scoreCustomerMatch(
      { fullName: "Ahmed Tazi", phone: "+212 661-234567", dateOfBirth: "1990-05-14" },
      { id: "cus_son", fullName: "Youssef Tazi", phone: "212661234567", dateOfBirth: "1990-05-14" }
    )
    expect(matchedFields).toEqual(expect.arrayContaining(["phone", "dateOfBirth"]))
    expect(confidence).toBeGreaterThanOrEqual(DUPLICATE_SURFACE_THRESHOLD)
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
