import { getSessionContext, type SessionContext } from "@/lib/auth/session"
import type { EmployeeRole } from "@/types/rental"

/** Shared guard for every /api/exports/* route: same company-derivation
 * (never a client-supplied id) and role check as the mutating server
 * actions use, just returning a Response instead of throwing — a route
 * handler has no ActionError-catching wrapper to rely on. */
export async function requireExportAccess(
  allowedRoles: EmployeeRole[]
): Promise<{ session: SessionContext } | { response: Response }> {
  const session = await getSessionContext()
  if (!session) {
    return { response: new Response("Sign in required", { status: 401 }) }
  }
  if (!allowedRoles.includes(session.role)) {
    return { response: new Response("Not permitted", { status: 403 }) }
  }
  return { session }
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
