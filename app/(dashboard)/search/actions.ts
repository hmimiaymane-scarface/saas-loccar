"use server"

import { requireSession } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/env"
import { globalSearch, type SearchResult } from "@/lib/search"

/**
 * Productization wave 2 phase 14 — found while verifying this phase's
 * own changes in mock mode: this action called `createClient()`
 * unconditionally since the original roadmap's phase 13 first built
 * it, so the command palette has never actually worked in mock mode
 * (a full crash, not a graceful empty state) — the same
 * unguarded-`createClient()` class of bug phase 8 catalogued for ~20
 * other actions app-wide. Fixed here specifically because it blocked
 * verifying this very phase; matches the same
 * mock-mode-degrades-to-empty convention every read path in this app
 * already follows.
 */
export async function globalSearchAction(query: string): Promise<SearchResult[]> {
  if (!isSupabaseConfigured) return []
  const session = await requireSession()
  const supabase = await createClient()
  return globalSearch(supabase, session.company.id, query)
}
