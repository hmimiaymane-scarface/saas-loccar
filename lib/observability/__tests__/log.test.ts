import { describe, expect, it, vi, afterEach } from "vitest"

// Same mocking approach as lib/analytics/__tests__/track.test.ts —
// logOperationalEvent needs isSupabaseConfigured=true to reach its
// insert at all, which is always false under plain vitest.
const envMock = vi.hoisted(() => ({ isSupabaseConfigured: true }))
vi.mock("@/lib/env", () => ({ get isSupabaseConfigured() { return envMock.isSupabaseConfigured } }))

const sessionMock = vi.hoisted(() => ({
  session: {
    userId: "user-1",
    email: "owner@atlasrentcar.ma",
    profile: { fullName: "Owner", avatarPath: null, phone: null, preferredLanguage: "fr" },
    company: { id: "co_atlas" },
    role: "owner",
  } as never,
}))
vi.mock("@/lib/auth/session", () => ({ getSessionContext: async () => sessionMock.session }))

const supabaseMock = vi.hoisted(() => {
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
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabaseMock.client }))

describe("logOperationalEvent", () => {
  afterEach(() => {
    supabaseMock.inserted.length = 0
    supabaseMock.setInsertError(null)
    envMock.isSupabaseConfigured = true
    sessionMock.session = {
      userId: "user-1",
      email: "owner@atlasrentcar.ma",
      profile: { fullName: "Owner", avatarPath: null, phone: null, preferredLanguage: "fr" },
      company: { id: "co_atlas" },
      role: "owner",
    } as never
  })

  it("inserts an operational_events row attributed to the caller's own session, defaulting severity", async () => {
    const { logOperationalEvent } = await import("@/lib/observability/log")

    await logOperationalEvent({ source: "upload", message: "The object exceeded the maximum allowed size" })

    expect(supabaseMock.inserted).toEqual([
      {
        table: "operational_events",
        row: {
          company_id: "co_atlas",
          source: "upload",
          severity: "error",
          context: null,
          message: "The object exceeded the maximum allowed size",
          metadata: {},
          duration_ms: null,
        },
      },
    ])
  })

  it("passes severity/context/metadata/durationMs through when given", async () => {
    const { logOperationalEvent } = await import("@/lib/observability/log")

    await logOperationalEvent({
      source: "slow_route",
      severity: "warning",
      context: "ai-assistant/chat",
      message: "ai-assistant/chat took 4210ms",
      metadata: { threshold: 3000 },
      durationMs: 4210,
    })

    expect(supabaseMock.inserted[0].row).toMatchObject({
      severity: "warning",
      context: "ai-assistant/chat",
      metadata: { threshold: 3000 },
      duration_ms: 4210,
    })
  })

  it("does nothing in mock mode — never throws, never inserts", async () => {
    envMock.isSupabaseConfigured = false
    const { logOperationalEvent } = await import("@/lib/observability/log")

    await expect(logOperationalEvent({ source: "frontend", message: "boom" })).resolves.toBeUndefined()
    expect(supabaseMock.inserted).toEqual([])
  })

  it("does nothing when there's no session", async () => {
    sessionMock.session = null as never
    const { logOperationalEvent } = await import("@/lib/observability/log")

    await logOperationalEvent({ source: "frontend", message: "boom" })

    expect(supabaseMock.inserted).toEqual([])
  })

  it("swallows an insert error instead of throwing", async () => {
    supabaseMock.setInsertError({ message: "insert failed" })
    const { logOperationalEvent } = await import("@/lib/observability/log")

    await expect(logOperationalEvent({ source: "api_route", message: "boom" })).resolves.toBeUndefined()
  })
})
