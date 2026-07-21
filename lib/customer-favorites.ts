/**
 * Roadmap phase 09 requirement 1 — "favorite vehicles" on the Customer
 * Command Center. A frequency count over reservations already loaded
 * for the customer detail page (no new query) — the same
 * count-and-take-the-mode shape as
 * `lib/customer-intelligence-store.ts#gatherCustomerRawData`'s
 * preferred-category logic, but per specific vehicle rather than per
 * category, and returning the top few instead of just the top one.
 */

export interface FavoriteVehicleReservation {
  status: string
  vehicle: { id: string; make: string; model: string; plate: string } | null
}

export interface FavoriteVehicleEntry {
  vehicleId: string
  vehicleLabel: string
  plate: string
  rentalCount: number
}

/** Only completed/active reservations count as "rented", same
 * inclusion rule the CLV/preferred-category calculation uses — a
 * cancelled or still-pending request was never actually driven. Ties
 * keep first-seen order (the input's own order, typically newest
 * first from `getCustomerDetail`), not re-sorted by anything else. */
export function computeFavoriteVehicles(
  reservations: FavoriteVehicleReservation[],
  limit = 3
): FavoriteVehicleEntry[] {
  const counts = new Map<string, FavoriteVehicleEntry>()
  for (const r of reservations) {
    if (r.status !== "completed" && r.status !== "active") continue
    if (!r.vehicle) continue
    const existing = counts.get(r.vehicle.id)
    if (existing) {
      existing.rentalCount += 1
    } else {
      counts.set(r.vehicle.id, {
        vehicleId: r.vehicle.id,
        vehicleLabel: `${r.vehicle.make} ${r.vehicle.model}`,
        plate: r.vehicle.plate,
        rentalCount: 1,
      })
    }
  }
  return [...counts.values()]
    .filter((entry) => entry.rentalCount > 1)
    .sort((a, b) => b.rentalCount - a.rentalCount)
    .slice(0, limit)
}
