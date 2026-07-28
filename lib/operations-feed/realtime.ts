import { createClient } from "@/lib/supabase/server"
import { evaluateMissingHandoffPhotos } from "@/lib/operations-feed/observers"
import { upsertOperationsFeedItem } from "@/lib/operations-feed/upsert"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Roadmap phase 34 ("Separate Real-Time Operations from Daily
 * Intelligence") — the real-time half of the missing-handoff-photos
 * fix. Scoped to exactly one inspection (not a company-wide run),
 * fetching just its own existing `operations_feed_items` row and
 * reconciling through the same `upsertOperationsFeedItem` the daily
 * batch job uses, so the two paths can never disagree on what
 * "open"/"dismissed" means for the same entity.
 *
 * Only ever evaluates `draft` inspections — a `completed` one can never
 * be missing the two required handoff photos (`complete_inspection()`'s
 * own hard gate), so there's nothing useful to check there; silently
 * returns rather than treating that as an error.
 */
async function recomputeMissingHandoffPhotos(
  supabase: SupabaseServerClient,
  companyId: string,
  inspectionId: string,
  now: Date
): Promise<void> {
  const { data: inspection, error } = await supabase
    .from("inspections")
    .select("id, reservation_id, type, status, reservation:reservations(reference)")
    .eq("id", inspectionId)
    .eq("company_id", companyId)
    .maybeSingle()
  if (error) throw error
  if (!inspection || inspection.status !== "draft") return

  const reservation = inspection.reservation as unknown as { reference: string } | null
  if (!reservation) return

  const { data: media, error: mediaError } = await supabase
    .from("media")
    .select("caption")
    .eq("company_id", companyId)
    .eq("entity_type", "inspection")
    .eq("entity_id", inspectionId)
  if (mediaError) throw mediaError

  const capturedSlots = (media ?? []).map((m) => m.caption).filter((c): c is string => Boolean(c))

  const draft = evaluateMissingHandoffPhotos({
    inspectionId,
    reservationId: inspection.reservation_id,
    reservationReference: reservation.reference,
    type: inspection.type as never,
    capturedSlots,
  })

  const key = { observerType: "missing_handoff_photos" as const, entityType: "inspection" as const, entityId: inspectionId }
  const { data: existing, error: existingError } = await supabase
    .from("operations_feed_items")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("observer_type", key.observerType)
    .eq("entity_type", key.entityType)
    .eq("entity_id", key.entityId)
    .in("status", ["open", "dismissed"])
    .maybeSingle()
  if (existingError) throw existingError

  await upsertOperationsFeedItem(supabase, companyId, key, draft, existing ?? undefined, now)
}

/** Best-effort — never fails the real upload it's called from, same
 * contract as `lib/vehicle-intelligence-store.ts#recomputeVehicleIntelligenceBestEffort`. */
export async function recomputeMissingHandoffPhotosBestEffort(
  supabase: SupabaseServerClient,
  companyId: string,
  inspectionId: string,
  now: Date = new Date()
): Promise<void> {
  try {
    await recomputeMissingHandoffPhotos(supabase, companyId, inspectionId, now)
  } catch {
    // Best-effort — see doc comment above.
  }
}
