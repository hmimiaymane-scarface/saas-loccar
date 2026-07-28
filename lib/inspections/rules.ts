import type { FuelLevel } from "@/types/rental"
import { REQUIRED_PHOTO_SLOT_KEYS } from "@/lib/inspections/photo-slots"
import type { RequirementItem } from "@/lib/workflow/steps"

/**
 * Pure mirrors of the cross-field checks enforced by complete_inspection()
 * (supabase/migrations/20260719091100_inspection_lifecycle.sql). The
 * database is what actually enforces these — this module exists so the
 * same rules can drive an inline warning in the return wizard before the
 * user even submits, and so they're unit-testable without a live
 * Supabase project.
 */

export function hasRequiredFieldsToComplete(fields: {
  odometerKm: number | null
  fuelLevel: FuelLevel | null
}): boolean {
  return fields.odometerKm != null && fields.fuelLevel != null
}

/** A return inspection's odometer reading can never be lower than the
 * pickup inspection's — the vehicle doesn't drive backwards. A missing
 * pickup reading is not itself an odometer violation (nothing to compare
 * against yet), so it passes here. */
export function isValidReturnOdometer(returnOdometerKm: number, pickupOdometerKm: number | null): boolean {
  if (pickupOdometerKm == null) return true
  return returnOdometerKm >= pickupOdometerKm
}

/** Mirrors the required-photo check added to complete_inspection() in
 * 20260802090000_inspection_photo_completeness.sql (roadmap phase 15,
 * requirement 1/5) — lets the wizard show a specific "you're missing
 * the rear and odometer photos" message before ever calling the RPC,
 * rather than only finding out from a raised exception after the fact. */
export function missingRequiredPhotoSlots(capturedSlotKeys: string[]): string[] {
  const captured = new Set(capturedSlotKeys)
  return REQUIRED_PHOTO_SLOT_KEYS.filter((key) => !captured.has(key))
}

export interface PickupInspectionProgress {
  odometerKm: number | null
  fuelLevel: FuelLevel | null
  capturedPhotoSlotKeys: string[]
  existingDamageReviewed: boolean
}

/**
 * Roadmap phase 25 — the single definition of "is this pickup inspection
 * actually done," used both for the step-level completeness indicator
 * and the wizard-level "what's left" strip, so the two can never
 * silently disagree about what "done" means (previously the wizard-level
 * check only looked at odometer/fuel/cleanliness/overallCondition — it
 * could say "done" while required photos or the damage review were
 * still outstanding, even though activating was already correctly
 * blocked on those). Mirrors complete_inspection()'s pickup-specific
 * checks in 20260808090000_pickup_existing_damage_review.sql.
 */
export function pickupCompletenessItems(progress: PickupInspectionProgress): RequirementItem[] {
  return [
    { label: "Odometer reading", done: progress.odometerKm != null },
    { label: "Fuel level", done: progress.fuelLevel != null },
    { label: "Required photos", done: missingRequiredPhotoSlots(progress.capturedPhotoSlotKeys).length === 0 },
    { label: "Existing damage reviewed", done: progress.existingDamageReviewed },
  ]
}

export function isPickupInspectionComplete(progress: PickupInspectionProgress): boolean {
  return pickupCompletenessItems(progress).every((item) => item.done)
}
