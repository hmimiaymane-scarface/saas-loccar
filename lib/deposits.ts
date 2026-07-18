import type { DepositStatus } from "@/types/rental"

/**
 * Single source of truth for deposit status. Pure so it's unit-testable
 * without a live Supabase project — the `deposits` table's `status`
 * column is always derived by calling this, never hand-set, so the
 * lifecycle can't silently drift between the app and the database.
 */
export function computeDepositStatus(
  expected: number,
  collected: number,
  returned: number,
  retained: number
): DepositStatus {
  if (collected <= 0) return expected > 0 ? "expected" : "not_required"
  const resolved = returned + retained
  if (resolved >= collected) {
    if (retained > 0 && returned > 0) return "partially_returned"
    if (retained > 0) return "retained"
    return "returned"
  }
  if (resolved > 0) return "partially_returned"
  return collected < expected ? "partially_collected" : "collected"
}

/** Amount currently held by the agency: collected minus whatever has
 * already been returned or retained. Never negative in practice — the
 * `deposits` table's check constraint (returned + retained <= collected)
 * guarantees that at the database layer. */
export function depositHeldMad(deposit: {
  collectedMad: number
  returnedMad: number
  retainedMad: number
}): number {
  return deposit.collectedMad - deposit.returnedMad - deposit.retainedMad
}

/** Mirrors the check constraint on public.deposits: returned + retained
 * can never exceed what was actually collected. Used to fail fast with a
 * friendly message before hitting the database. */
export function exceedsCollected(collected: number, returned: number, retained: number): boolean {
  return returned + retained > collected
}
