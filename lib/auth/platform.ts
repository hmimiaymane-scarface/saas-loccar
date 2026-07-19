import { cache } from "react"
import { redirect } from "next/navigation"

import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { ActionError } from "@/lib/auth/guard"

export interface PlatformSessionContext {
  userId: string
  email: string | null
}

/**
 * Platform-admin identity is entirely separate from
 * lib/auth/session.ts#getSessionContext — a platform admin may have no
 * company membership at all, and a company owner/manager is never a
 * platform admin just by virtue of their tenant role. This calls the
 * is_platform_admin() SECURITY DEFINER function (see
 * supabase/migrations/20260721090000_platform_admins.sql) rather than
 * querying platform_admins directly, since that table has no SELECT
 * policy for anyone.
 *
 * Returns null for anyone who isn't signed in or isn't a platform admin
 * — callers decide what to do about it (requirePlatformAdmin below
 * redirects/throws; a page could instead render nothing).
 */
export const getPlatformSession = cache(async (): Promise<PlatformSessionContext | null> => {
  if (!isSupabaseConfigured) {
    // Mock mode: there's no real auth to check against, so the one mock
    // identity is treated as a platform admin too — otherwise this whole
    // area of the app would be undemoable without a live Supabase project.
    return { userId: "mock-user", email: "owner@platform.example" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin")
  if (error || !isAdmin) return null

  return { userId: user.id, email: user.email ?? null }
})

/** For platform pages (Server Components): redirects a non-admin to
 * /overview rather than exposing a 403 with information about what
 * exists at this URL. A signed-out user goes to /sign-in first, same as
 * everywhere else in the app. */
export async function requirePlatformAdminPage(): Promise<PlatformSessionContext> {
  const session = await getPlatformSession()
  if (!session) redirect("/overview")
  return session
}

/** For platform server actions: throws ActionError (turned into a plain
 * `{ error }` result by the caller) instead of redirecting, matching the
 * convention in lib/auth/guard.ts. */
export async function requirePlatformAdminAction(): Promise<PlatformSessionContext> {
  const session = await getPlatformSession()
  if (!session) throw new ActionError("You don't have permission to do this.")
  return session
}
