import type { FuelLevel } from "@/types/rental"

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
