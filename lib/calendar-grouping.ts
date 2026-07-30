import type { Booking } from "@/types/rental"
import type { MaintenanceBlock } from "@/lib/data"

/**
 * Roadmap phase 41 (Frontend Performance Pass). Both calendar views
 * (`FleetTimeline`, `MobileCalendar`'s vehicle/day modes) were doing
 * `vehicles.map(v => bookings.filter(b => b.vehicle?.id === v.id))` —
 * an O(vehicles × bookings) scan repeated on every render/request. A
 * single O(bookings + maintenance) pass building these maps once, then
 * an O(1) `.get()` per vehicle/day, is the same output for a fraction
 * of the work at fleet sizes where this matters. Pure and
 * dependency-free on purpose, same convention as `lib/calendar-dates.ts`.
 */
export function groupBookingsByVehicle(bookings: Booking[]): Map<string, Booking[]> {
  const map = new Map<string, Booking[]>()
  for (const booking of bookings) {
    const vehicleId = booking.vehicle?.id
    if (!vehicleId) continue
    const list = map.get(vehicleId)
    if (list) list.push(booking)
    else map.set(vehicleId, [booking])
  }
  return map
}

export function groupMaintenanceByVehicle(blocks: MaintenanceBlock[]): Map<string, MaintenanceBlock[]> {
  const map = new Map<string, MaintenanceBlock[]>()
  for (const block of blocks) {
    const list = map.get(block.vehicleId)
    if (list) list.push(block)
    else map.set(block.vehicleId, [block])
  }
  return map
}

export interface DayBookings {
  pickups: Booking[]
  returns: Booking[]
}

/** Keyed by date, not vehicle — `MobileCalendar`'s Today/Week modes
 * group across all vehicles by day instead. A booking that starts and
 * ends the same day counts only as a pickup (matches the pre-existing
 * `dayContent` behavior this replaces). */
export function groupBookingsByDate(bookings: Booking[]): Map<string, DayBookings> {
  const map = new Map<string, DayBookings>()
  function ensure(key: string): DayBookings {
    let entry = map.get(key)
    if (!entry) {
      entry = { pickups: [], returns: [] }
      map.set(key, entry)
    }
    return entry
  }
  for (const booking of bookings) {
    ensure(booking.startDate).pickups.push(booking)
    if (booking.endDate !== booking.startDate) ensure(booking.endDate).returns.push(booking)
  }
  return map
}

export function groupMaintenanceByDate(blocks: MaintenanceBlock[]): Map<string, MaintenanceBlock[]> {
  const map = new Map<string, MaintenanceBlock[]>()
  for (const block of blocks) {
    const list = map.get(block.date)
    if (list) list.push(block)
    else map.set(block.date, [block])
  }
  return map
}
