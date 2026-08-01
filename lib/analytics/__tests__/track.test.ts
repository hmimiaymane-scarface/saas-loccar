import { describe, expect, it, vi, afterEach } from "vitest"

// trackUsageEvent needs isSupabaseConfigured=true to reach its insert at
// all (see lib/env.ts) — under plain vitest it's always false (AGENTS.md's
// own testing-conventions note), so unlike most of this repo's action
// tests, this one has to override it per test rather than rely on the
// default mock identity.
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

describe("trackUsageEvent", () => {
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

  it("inserts a usage_events row attributed to the caller's own session", async () => {
    const { trackUsageEvent } = await import("@/lib/analytics/track")

    await trackUsageEvent("quick_action_used", { metadata: { action: "New Rental" } })

    expect(supabaseMock.inserted).toEqual([
      {
        table: "usage_events",
        row: {
          company_id: "co_atlas",
          user_id: "user-1",
          event_type: "quick_action_used",
          session_id: null,
          entity_id: null,
          metadata: { action: "New Rental" },
        },
      },
    ])
  })

  it("passes sessionId/entityId through when given", async () => {
    const { trackUsageEvent } = await import("@/lib/analytics/track")

    await trackUsageEvent("new_rental_step_viewed", {
      sessionId: "attempt-1",
      entityId: "res-1",
      metadata: { step: 1 },
    })

    expect(supabaseMock.inserted[0].row).toMatchObject({
      session_id: "attempt-1",
      entity_id: "res-1",
      metadata: { step: 1 },
    })
  })

  it("does nothing in mock mode (isSupabaseConfigured false) — never throws, never inserts", async () => {
    envMock.isSupabaseConfigured = false
    const { trackUsageEvent } = await import("@/lib/analytics/track")

    await expect(trackUsageEvent("search_opened")).resolves.toBeUndefined()
    expect(supabaseMock.inserted).toEqual([])
  })

  it("does nothing when there's no session", async () => {
    sessionMock.session = null as never
    const { trackUsageEvent } = await import("@/lib/analytics/track")

    await trackUsageEvent("search_opened")

    expect(supabaseMock.inserted).toEqual([])
  })

  it("swallows an insert error instead of throwing", async () => {
    supabaseMock.setInsertError({ message: "insert failed" })
    const { trackUsageEvent } = await import("@/lib/analytics/track")

    await expect(trackUsageEvent("error_occurred", { metadata: { context: "test" } })).resolves.toBeUndefined()
  })
})
