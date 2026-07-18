import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import { requireSupabaseEnv } from "@/lib/env"
import type { Database } from "@/types/database"

/**
 * Server-side Supabase client for Server Components, Server Actions and
 * Route Handlers. Reads/writes auth cookies via `next/headers`. Only uses
 * the public anon key — RLS is what enforces per-company access, not this
 * client's privilege level.
 *
 * Server Components can't write cookies, so `setAll` there is wrapped in a
 * try/catch and relies on `middleware.ts` to actually refresh the session.
 */
export async function createClient() {
  const { supabaseUrl, supabaseAnonKey } = requireSupabaseEnv()
  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component during render — middleware
          // already refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}
