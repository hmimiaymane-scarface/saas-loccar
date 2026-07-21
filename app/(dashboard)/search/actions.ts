"use server"

import { requireSession } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { globalSearch, type SearchResult } from "@/lib/search"

export async function globalSearchAction(query: string): Promise<SearchResult[]> {
  const session = await requireSession()
  const supabase = await createClient()
  return globalSearch(supabase, session.company.id, query)
}
