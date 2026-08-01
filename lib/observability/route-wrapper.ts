import { logOperationalEvent } from "@/lib/observability/log"

/** Above this, a successful API route response is still logged as a
 * slow_route warning — chosen as "clearly sluggish for an interactive
 * request," not a hard SLA. */
const SLOW_ROUTE_THRESHOLD_MS = 3000

/**
 * Wraps a Route Handler export (`export const POST = withRouteObservability(...)`)
 * to give every non-cron API route the server-error + slow-route
 * visibility named in phase 59's brief, without touching each route's
 * own internal try/catch blocks — those keep returning whatever
 * friendly error body they already do; this only adds a log entry
 * alongside it, then re-throws so the route's own behavior (including
 * Next's own 500 handling for anything genuinely uncaught) is
 * unchanged.
 *
 * Not used by the two cron routes — those already have their own
 * per-company error handling and run with no session, so they log via
 * lib/observability/log-admin.ts's logOperationalEventAsAdmin directly
 * instead of through this (session-derived) path.
 */
export function withRouteObservability(
  routeName: string,
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const start = Date.now()
    try {
      const response = await handler(request)
      const durationMs = Date.now() - start
      if (durationMs > SLOW_ROUTE_THRESHOLD_MS) {
        void logOperationalEvent({
          source: "slow_route",
          severity: "warning",
          context: routeName,
          message: `${routeName} took ${durationMs}ms`,
          durationMs,
        })
      }
      return response
    } catch (err) {
      const durationMs = Date.now() - start
      void logOperationalEvent({
        source: "api_route",
        severity: "error",
        context: routeName,
        message: err instanceof Error ? err.message : String(err),
        durationMs,
      })
      throw err
    }
  }
}
