import { describe, expect, it, vi, afterEach } from "vitest"

const adminMock = vi.hoisted(() => {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  let insertError: { message: string } | null = null
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ table, row })
          return Promise.resolve({ error: insertError })
        },
      }
    },
  }
  return { inserted, client, setInsertError: (e: { message: string } | null) => { insertError = e } }
})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }))

describe("logOperationalEventAsAdmin", () => {
  afterEach(() => {
    adminMock.inserted.length = 0
    adminMock.setInsertError(null)
  })

  it("inserts an operational_events row with the given companyId, bypassing any session", async () => {
    const { logOperationalEventAsAdmin } = await import("@/lib/observability/log-admin")

    await logOperationalEventAsAdmin({
      companyId: "co_atlas",
      source: "cron_job",
      context: "operations-feed",
      message: "Timed out contacting the AI provider",
    })

    expect(adminMock.inserted).toEqual([
      {
        table: "operational_events",
        row: {
          company_id: "co_atlas",
          source: "cron_job",
          severity: "error",
          context: "operations-feed",
          message: "Timed out contacting the AI provider",
          metadata: {},
          duration_ms: null,
        },
      },
    ])
  })

  it("allows a null companyId, for a failure that isn't scoped to one tenant", async () => {
    const { logOperationalEventAsAdmin } = await import("@/lib/observability/log-admin")

    await logOperationalEventAsAdmin({ companyId: null, source: "cron_job", message: "Could not list companies" })

    expect(adminMock.inserted[0].row).toMatchObject({ company_id: null })
  })

  it("swallows an insert error instead of throwing", async () => {
    adminMock.setInsertError({ message: "insert failed" })
    const { logOperationalEventAsAdmin } = await import("@/lib/observability/log-admin")

    await expect(
      logOperationalEventAsAdmin({ companyId: "co_atlas", source: "notification", message: "boom" })
    ).resolves.toBeUndefined()
  })

  it("swallows createAdminClient itself throwing (e.g. missing service-role key)", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    vi.mocked(createAdminClient).mockImplementationOnce(() => {
      throw new Error("Admin Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    })
    const { logOperationalEventAsAdmin } = await import("@/lib/observability/log-admin")

    await expect(
      logOperationalEventAsAdmin({ companyId: "co_atlas", source: "notification", message: "boom" })
    ).resolves.toBeUndefined()
  })
})
