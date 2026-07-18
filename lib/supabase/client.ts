"use client"

import { createBrowserClient } from "@supabase/ssr"

import { requireSupabaseEnv } from "@/lib/env"
import type { Database } from "@/types/database"

/**
 * Browser Supabase client. Only ever uses the public URL and anon key —
 * safe to bundle client-side. Create a fresh instance per call site rather
 * than module-level singletons, per @supabase/ssr guidance for App Router.
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = requireSupabaseEnv()
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}
