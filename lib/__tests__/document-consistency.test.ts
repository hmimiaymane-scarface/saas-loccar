import { describe, expect, it } from "vitest"

import {
  snapshotFromFields,
  findNameMismatches,
  findBirthDateMismatches,
  findConsistencyIssues,
  getConsistencyIssuesForCustomer,
  type DocumentFieldSnapshot,
} from "@/lib/document-consistency"
import type { ExtractedFields } from "@/lib/document-extraction"

describe("snapshotFromFields", () => {
  it("extracts fullName and birthDate string values", () => {
    const fields: ExtractedFields = {
      fullName: { value: "Aicha Bennani", confidence: 95 },
      birthDate: { value: "1990-01-01", confidence: 90 },
      idNumber: { value: "AB123", confidence: 99 },
    }
    expect(snapshotFromFields("doc-1", "identity_document", fields)).toEqual({
      documentId: "doc-1",
      category: "identity_document",
      fullName: "Aicha Bennani",
      birthDate: "1990-01-01",
    })
  })

  it("returns null for fields the category's schema doesn't have", () => {
    const fields: ExtractedFields = { policyNumber: { value: "POL-1", confidence: 90 } }
    expect(snapshotFromFields("doc-2", "insurance_document", fields)).toEqual({
      documentId: "doc-2",
      category: "insurance_document",
      fullName: null,
      birthDate: null,
    })
  })
})

describe("findNameMismatches", () => {
  it("flags a spelling difference across two documents", () => {
    const snapshots: DocumentFieldSnapshot[] = [
      { documentId: "doc-1", category: "identity_document", fullName: "Aicha Bennani", birthDate: null },
      { documentId: "doc-2", category: "driving_licence", fullName: "Aicha Benani", birthDate: null },
    ]
    const issues = findNameMismatches(snapshots)
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe("fullName")
    expect(issues[0].values.map((v) => v.documentId).sort()).toEqual(["doc-1", "doc-2"])
  })

  it("does not flag when names agree after normalization", () => {
    const snapshots: DocumentFieldSnapshot[] = [
      { documentId: "doc-1", category: "identity_document", fullName: "Aicha Bennani", birthDate: null },
      { documentId: "doc-2", category: "driving_licence", fullName: "aicha  bennani", birthDate: null },
    ]
    expect(findNameMismatches(snapshots)).toEqual([])
  })

  it("does not flag with fewer than two documents carrying the field", () => {
    const snapshots: DocumentFieldSnapshot[] = [
      { documentId: "doc-1", category: "identity_document", fullName: "Aicha Bennani", birthDate: null },
      { documentId: "doc-2", category: "insurance_document", fullName: null, birthDate: null },
    ]
    expect(findNameMismatches(snapshots)).toEqual([])
  })
})

describe("findBirthDateMismatches", () => {
  it("flags a differing birth date", () => {
    const snapshots: DocumentFieldSnapshot[] = [
      { documentId: "doc-1", category: "identity_document", fullName: null, birthDate: "1990-01-01" },
      { documentId: "doc-2", category: "identity_document", fullName: null, birthDate: "1991-06-15" },
    ]
    const issues = findBirthDateMismatches(snapshots)
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe("birthDate")
  })

  it("does not flag identical birth dates", () => {
    const snapshots: DocumentFieldSnapshot[] = [
      { documentId: "doc-1", category: "identity_document", fullName: null, birthDate: "1990-01-01" },
      { documentId: "doc-2", category: "identity_document", fullName: null, birthDate: "1990-01-01" },
    ]
    expect(findBirthDateMismatches(snapshots)).toEqual([])
  })
})

describe("findConsistencyIssues", () => {
  it("combines name and birth date issues", () => {
    const snapshots: DocumentFieldSnapshot[] = [
      { documentId: "doc-1", category: "identity_document", fullName: "Aicha Bennani", birthDate: "1990-01-01" },
      { documentId: "doc-2", category: "driving_licence", fullName: "Aicha Benani", birthDate: null },
    ]
    const issues = findConsistencyIssues(snapshots)
    expect(issues.map((i) => i.field)).toEqual(["fullName"])
  })

  it("returns [] for a customer with a single consistent document", () => {
    const snapshots: DocumentFieldSnapshot[] = [
      { documentId: "doc-1", category: "identity_document", fullName: "Aicha Bennani", birthDate: "1990-01-01" },
    ]
    expect(findConsistencyIssues(snapshots)).toEqual([])
  })
})

function chainable(result: { data: unknown; error: unknown }) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        const promise = Promise.resolve(result)
        return promise.then.bind(promise)
      }
      return () => proxy
    },
  }
  const proxy = new Proxy({}, handler)
  return proxy
}

describe("getConsistencyIssuesForCustomer", () => {
  it("returns [] without an extractions query when the customer has no active documents", async () => {
    const client = {
      from: (table: string) => {
        if (table === "documents") return chainable({ data: [], error: null })
        throw new Error(`unexpected table ${table}`)
      },
    }
    const result = await getConsistencyIssuesForCustomer(client as never, "co_1", "cus_1")
    expect(result).toEqual([])
  })

  it("uses each document's latest completed extraction and flags a mismatch", async () => {
    const docs = [
      { id: "doc-1", category: "identity_document" },
      { id: "doc-2", category: "driving_licence" },
    ]
    // Newest-first: doc-1 has two extractions, only the newer (Aicha
    // Bennani) should be used.
    const extractions = [
      { document_id: "doc-1", category: "identity_document", fields: { fullName: { value: "Aicha Bennani", confidence: 90 } }, created_at: "2026-07-20T00:00:00Z" },
      { document_id: "doc-2", category: "driving_licence", fields: { fullName: { value: "Aicha Benani", confidence: 90 } }, created_at: "2026-07-15T00:00:00Z" },
      { document_id: "doc-1", category: "identity_document", fields: { fullName: { value: "A. Bennani (typo run)", confidence: 40 } }, created_at: "2026-01-01T00:00:00Z" },
    ]

    const client = {
      from: (table: string) => {
        if (table === "documents") return chainable({ data: docs, error: null })
        if (table === "document_extractions") return chainable({ data: extractions, error: null })
        throw new Error(`unexpected table ${table}`)
      },
    }

    const result = await getConsistencyIssuesForCustomer(client as never, "co_1", "cus_1")
    expect(result).toHaveLength(1)
    expect(result[0].field).toBe("fullName")
    expect(result[0].values.find((v) => v.documentId === "doc-1")?.value).toBe("Aicha Bennani")
  })
})
