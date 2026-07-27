import { utcIsoToZonedLocal } from "@/lib/timezone"

/**
 * Productization wave 3 phase 20 — pure mode-finding helpers behind
 * "remember common pickup location" / "suggest usual deposit" /
 * "default pickup time intelligently". No Supabase dependency, so
 * these are unit-testable against hand-built fixtures — the DB-touching
 * shell (`lib/data.ts#getReservationSmartDefaults`) does the fetching
 * and calls these with plain arrays.
 */

/** Mode over non-empty strings. Ties broken by whichever value was
 * seen first, so results are deterministic given the same input order
 * (typically "most recent first"). */
export function mostCommonString(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed) continue
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/** Mode over positive amounts (zero/negative are noise, not a real
 * deposit someone paid). Same first-seen tie-break as `mostCommonString`. */
export function mostCommonAmount(amounts: (number | null | undefined)[]): number | null {
  const counts = new Map<number, number>()
  for (const amount of amounts) {
    if (!amount || amount <= 0) continue
    counts.set(amount, (counts.get(amount) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [amount, count] of counts) {
    if (count > bestCount) {
      best = amount
      bestCount = count
    }
  }
  return best
}

/** Mode over the local (company-timezone) hour-of-day a set of pickup
 * timestamps fall on. Returns null given no timestamps — the caller
 * keeps its own existing fallback in that case rather than this module
 * inventing one. */
export function mostCommonHour(isoTimestamps: string[], timeZone: string): number | null {
  const hours = isoTimestamps.map((iso) => Number(utcIsoToZonedLocal(iso, timeZone).split("T")[1].split(":")[0]))
  const counts = new Map<number, number>()
  for (const hour of hours) {
    counts.set(hour, (counts.get(hour) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [hour, count] of counts) {
    if (count > bestCount) {
      best = hour
      bestCount = count
    }
  }
  return best
}
