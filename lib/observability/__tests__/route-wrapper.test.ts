import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

const logMock = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }))
vi.mock("@/lib/observability/log", () => ({ logOperationalEvent: logMock.fn }))

describe("withRouteObservability", () => {
  beforeEach(() => {
    logMock.fn.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the handler's response unchanged on a fast success, logging nothing", async () => {
    const { withRouteObservability } = await import("@/lib/observability/route-wrapper")
    const response = new Response("ok")
    const wrapped = withRouteObservability("test/route", async () => response)

    const result = await wrapped(new Request("http://localhost/test"))

    expect(result).toBe(response)
    expect(logMock.fn).not.toHaveBeenCalled()
  })

  it("logs a slow_route warning when the handler exceeds the threshold, but still returns its response", async () => {
    let now = 1_000
    vi.spyOn(Date, "now").mockImplementation(() => now)
    const { withRouteObservability } = await import("@/lib/observability/route-wrapper")
    const response = new Response("ok")
    const wrapped = withRouteObservability("test/slow-route", async () => {
      now += 5_000
      return response
    })

    const result = await wrapped(new Request("http://localhost/test"))

    expect(result).toBe(response)
    expect(logMock.fn).toHaveBeenCalledWith(
      expect.objectContaining({ source: "slow_route", severity: "warning", context: "test/slow-route", durationMs: 5000 })
    )
  })

  it("logs an api_route error and re-throws when the handler throws", async () => {
    const { withRouteObservability } = await import("@/lib/observability/route-wrapper")
    const wrapped = withRouteObservability("test/failing-route", async () => {
      throw new Error("boom")
    })

    await expect(wrapped(new Request("http://localhost/test"))).rejects.toThrow("boom")
    expect(logMock.fn).toHaveBeenCalledWith(
      expect.objectContaining({ source: "api_route", severity: "error", context: "test/failing-route", message: "boom" })
    )
  })
})
