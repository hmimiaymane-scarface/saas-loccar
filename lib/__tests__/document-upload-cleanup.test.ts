import { describe, expect, it, vi } from "vitest"

/**
 * Roadmap phase 70 ("Paid-Customer Readiness" — "Documents reliable").
 * The upload itself always succeeds browser -> Storage before any of
 * these server actions ever run (docs/failure-registry.md's long-
 * standing "two-step flow, no orphan handling" gap). If the DB insert
 * that records it then fails, the Storage object must not be left
 * behind with nothing referencing it. Same mocking convention as
 * lib/__tests__/document-access-logging.test.ts.
 */
const supabaseMock = vi.hoisted(() => {
  const removed: { bucket: string; paths: string[] }[] = []
  const client = {
    from(table: string) {
      if (table === "documents" || table === "media") {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle: async () => ({ data: null, error: null }),
          insert() {
            return {
              select: () => ({
                single: async () => ({ data: null, error: { message: "insert failed" } }),
              }),
            }
          },
        }
      }
      return {
        update() {
          return this
        },
        eq() {
          return this
        },
      }
    },
    storage: {
      from(bucket: string) {
        return {
          remove: async (paths: string[]) => {
            removed.push({ bucket, paths })
            return { data: null, error: null }
          },
        }
      },
    },
  }
  return { removed, client }
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseMock.client,
}))

describe("upload-recording actions clean up an orphaned Storage object on DB failure", () => {
  it("createDocumentRecord removes the uploaded file when the documents insert fails", async () => {
    supabaseMock.removed.length = 0
    const { createDocumentRecord } = await import("@/app/(dashboard)/documents/actions")

    const result = await createDocumentRecord({
      category: "identity_document",
      storagePath: "co_atlas/documents/abc-passport.pdf",
      originalFilename: "passport.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      customerId: "cus-1",
    })

    expect(result.error).toBe("insert failed")
    expect(supabaseMock.removed).toEqual([{ bucket: "company-files", paths: ["co_atlas/documents/abc-passport.pdf"] }])
  })

  it("attachInspectionMedia removes the uploaded file when the media insert fails", async () => {
    supabaseMock.removed.length = 0
    const { attachInspectionMedia } = await import("@/app/(dashboard)/inspections/actions")

    const result = await attachInspectionMedia("insp-1", "co_atlas/inspections/abc-photo.jpg", "photo.jpg", "image/jpeg", 2048)

    expect(result.error).toBe("insert failed")
    expect(supabaseMock.removed).toEqual([{ bucket: "company-files", paths: ["co_atlas/inspections/abc-photo.jpg"] }])
  })

  it("attachDamageMedia removes the uploaded file when the media insert fails", async () => {
    supabaseMock.removed.length = 0
    const { attachDamageMedia } = await import("@/app/(dashboard)/damages/actions")

    const result = await attachDamageMedia("dmg-1", "co_atlas/damages/abc-photo.jpg", "photo.jpg", "image/jpeg", 2048)

    expect(result.error).toBe("insert failed")
    expect(supabaseMock.removed).toEqual([{ bucket: "company-files", paths: ["co_atlas/damages/abc-photo.jpg"] }])
  })
})
