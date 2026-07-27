import { createClient } from "@/lib/supabase/server"
import { searchDocumentIdsByExtractedFields } from "@/lib/documents"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Roadmap phase 13 requirement 7 — "search as a universal command."
 * The header's "Search... ⌘K" button was purely decorative before
 * this phase (no handler, no dialog, no backing function anywhere) —
 * this is a genuine new build, not an extension of something that
 * already searched a subset of entities.
 *
 * One ilike query per entity type, run in parallel, each capped at a
 * few results — a real search-as-you-type command palette, not a
 * full paginated search results page (that's what each entity's own
 * list page + filters already are for).
 *
 * Productization wave 2 phase 14 — documents also match by extracted
 * field value now (licence number, plate, VIN, customer name, etc. —
 * whatever OCR pulled off the file), reusing
 * `lib/documents.ts#searchDocumentIdsByExtractedFields` exactly (the
 * same function the `/documents` page's own search already used) —
 * not a second extraction-matching implementation.
 */

export type SearchResultType = "vehicle" | "customer" | "reservation" | "contract" | "document" | "employee"

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string
  href: string
}

const PER_TYPE_LIMIT = 5

function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, (c) => `\\${c}`)
}

export async function globalSearch(supabase: SupabaseServerClient, companyId: string, rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim()
  if (query.length < 2) return []
  const q = escapeIlike(query)

  const [vehicles, customers, reservations, contracts, filenameDocuments, employees, extractedDocumentIds] = await Promise.all([
    supabase.from("vehicles").select("id, make, model, registration_number").eq("company_id", companyId).or(`registration_number.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`).limit(PER_TYPE_LIMIT),
    supabase.from("customers").select("id, full_name, phone").eq("company_id", companyId).or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(PER_TYPE_LIMIT),
    supabase.from("reservations").select("id, reference, customer:customers(full_name)").eq("company_id", companyId).ilike("reference", `%${q}%`).limit(PER_TYPE_LIMIT),
    supabase.from("contracts").select("id, contract_number, customer:customers(full_name)").eq("company_id", companyId).ilike("contract_number", `%${q}%`).limit(PER_TYPE_LIMIT),
    supabase.from("documents").select("id, original_filename, category").eq("company_id", companyId).eq("status", "active").or(`original_filename.ilike.%${q}%,category.ilike.%${q}%`).limit(PER_TYPE_LIMIT),
    supabase.from("company_memberships").select("user_id, profile:profiles(full_name)").eq("company_id", companyId).limit(50),
    searchDocumentIdsByExtractedFields(supabase, companyId, query),
  ])

  const filenameMatchIds = new Set((filenameDocuments.data ?? []).map((d) => d.id))
  const remainingSlots = PER_TYPE_LIMIT - filenameMatchIds.size
  const extraIds = extractedDocumentIds.filter((id) => !filenameMatchIds.has(id)).slice(0, Math.max(0, remainingSlots))
  const extraDocuments =
    extraIds.length > 0
      ? await supabase.from("documents").select("id, original_filename, category").eq("company_id", companyId).eq("status", "active").in("id", extraIds)
      : { data: [] as { id: string; original_filename: string; category: string }[] }

  const documents = { data: [...(filenameDocuments.data ?? []), ...(extraDocuments.data ?? [])] }

  const results: SearchResult[] = []

  for (const v of vehicles.data ?? []) {
    results.push({ type: "vehicle", id: v.id, title: `${v.make} ${v.model}`, subtitle: v.registration_number, href: `/fleet/${v.id}` })
  }
  for (const c of customers.data ?? []) {
    results.push({ type: "customer", id: c.id, title: c.full_name, subtitle: c.phone, href: `/customers/${c.id}` })
  }
  for (const r of reservations.data ?? []) {
    const customer = r.customer as unknown as { full_name: string } | null
    results.push({ type: "reservation", id: r.id, title: r.reference, subtitle: customer?.full_name ?? "", href: `/reservations/${r.id}` })
  }
  for (const c of contracts.data ?? []) {
    const customer = c.customer as unknown as { full_name: string } | null
    if (!c.contract_number) continue
    results.push({ type: "contract", id: c.id, title: c.contract_number, subtitle: customer?.full_name ?? "", href: `/contracts/${c.id}` })
  }
  for (const d of documents.data ?? []) {
    results.push({ type: "document", id: d.id, title: d.original_filename, subtitle: d.category, href: `/documents` })
  }
  // Employees aren't ilike-filterable server-side without a second
  // round trip to resolve profile names first (full_name lives on
  // `profiles`, joined here, not a column `company_memberships`
  // itself can filter on) — filtered in memory instead, capped at a
  // small membership page rather than the whole team for cost.
  const needle = query.toLowerCase()
  for (const m of employees.data ?? []) {
    const profile = m.profile as unknown as { full_name: string | null } | null
    if (!profile?.full_name || !profile.full_name.toLowerCase().includes(needle)) continue
    if (results.filter((r) => r.type === "employee").length >= PER_TYPE_LIMIT) break
    results.push({ type: "employee", id: m.user_id, title: profile.full_name, subtitle: "Team member", href: `/employees` })
  }

  return results
}

/** Fixed, stable presentation order — matches the order `globalSearch`
 * itself pushes results in, so grouping never has to guess at intent. */
const TYPE_ORDER: SearchResultType[] = ["vehicle", "customer", "reservation", "contract", "document", "employee"]

export interface SearchResultGroup {
  type: SearchResultType
  results: SearchResult[]
}

/**
 * Productization wave 2 phase 14 — real grouped sections for the
 * command palette, not just a per-row type badge on an otherwise flat
 * list. Pure and separate from `globalSearch` itself so the grouping
 * logic is unit-testable without a Supabase client.
 */
export function groupSearchResultsByType(results: SearchResult[]): SearchResultGroup[] {
  return TYPE_ORDER.map((type) => ({ type, results: results.filter((r) => r.type === type) })).filter((g) => g.results.length > 0)
}
