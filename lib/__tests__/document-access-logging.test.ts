import { describe, expect, it, vi } from "vitest"

/**
 * Roadmap phase 19 requirement 2 / acceptance criterion: "Sensitive
 * document access (view/download) is logged with who/when for every
 * access, verified by test." Same mocking convention as
 * lib/__tests__/activity-log.test.ts's own createCustomer integration
 * test: only @/lib/supabase/server needs mocking — requireSession()
 * resolves to this repo's fixed mock identity since isSupabaseConfigured
 * is false under vitest (see lib/env.ts), so no separate auth mock is
 * needed.
 */
const supabaseMock = vi.hoisted(() => {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  const documentRow = {
    original_filename: "passport-scan.pdf",
    reservation_id: "res-1",
    customer_id: "cus-1",
    vehicle_id: null,
  }
  const client = {
    from(table: string) {
      if (table === "documents") {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          maybeSingle: async () => ({ data: documentRow, error: null }),
        }
      }
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ table, row })
          const resolved = { data: { id: `fake-${table}-id` }, error: null }
          const promise = Promise.resolve(resolved)
          return Object.assign(promise, {
            select: () => ({ single: async () => resolved }),
          })
        },
      }
    },
  }
  return { inserted, client }
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseMock.client,
}))

describe("logDocumentAccess", () => {
  it("logs a document_viewed event with the actor, entity, and linked ids", async () => {
    const { logDocumentAccess } = await import("@/app/(dashboard)/documents/actions")

    await logDocumentAccess("doc-1", "viewed")

    const activityInsert = supabaseMock.inserted.find((entry) => entry.table === "activity_log")
    expect(activityInsert?.row).toMatchObject({
      company_id: "co_atlas",
      actor_id: "mock-user",
      type: "document_viewed",
      entity_type: "document",
      entity_id: "doc-1",
      title: "Document viewed: passport-scan.pdf",
      metadata: { reservation_id: "res-1", customer_id: "cus-1" },
    })
  })

  it("logs a document_downloaded event distinctly from viewed", async () => {
    supabaseMock.inserted.length = 0
    const { logDocumentAccess } = await import("@/app/(dashboard)/documents/actions")

    await logDocumentAccess("doc-1", "downloaded")

    const activityInsert = supabaseMock.inserted.find((entry) => entry.table === "activity_log")
    expect(activityInsert?.row).toMatchObject({ type: "document_downloaded" })
  })
})
