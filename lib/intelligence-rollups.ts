import { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Roadmap phase 13 requirements 6 (Fleet Health Overview, Customer
 * Health) — rolls up phase 06/08's per-entity scores into fleet-wide
 * and customer-base-wide summaries. No bulk (company-wide) read of
 * `vehicle_intelligence`/`customer_intelligence` existed anywhere in
 * this codebase before this phase except inside phase 12's own
 * observer job (which fetches for a different purpose and shape) —
 * these are the first general-purpose rollup reads.
 */

export interface ScoreRollup {
  averageScore: number
  entityCount: number
  bandCounts: Record<string, number>
}

const EMPTY_ROLLUP: ScoreRollup = { averageScore: 0, entityCount: 0, bandCounts: {} }

/** Pure aggregation — separated from the query so the math (average,
 * band tally) is unit-tested without a database. */
export function summarizeScores(rows: { score: number; band: string }[]): ScoreRollup {
  if (rows.length === 0) return EMPTY_ROLLUP
  const bandCounts: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    total += row.score
    bandCounts[row.band] = (bandCounts[row.band] ?? 0) + 1
  }
  return { averageScore: Math.round(total / rows.length), entityCount: rows.length, bandCounts }
}

export async function getFleetHealthRollup(supabase: SupabaseServerClient, companyId: string): Promise<ScoreRollup> {
  const { data, error } = await supabase.from("vehicle_intelligence").select("health_score, health_band").eq("company_id", companyId)
  if (error) throw error
  return summarizeScores((data ?? []).map((r) => ({ score: r.health_score as number, band: r.health_band as string })))
}

export async function getCustomerHealthRollup(supabase: SupabaseServerClient, companyId: string): Promise<ScoreRollup> {
  const { data, error } = await supabase.from("customer_intelligence").select("trust_score, trust_band").eq("company_id", companyId)
  if (error) throw error
  return summarizeScores((data ?? []).map((r) => ({ score: r.trust_score as number, band: r.trust_band as string })))
}
