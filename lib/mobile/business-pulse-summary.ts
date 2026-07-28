import type { DailyPickupCount } from "@/lib/data"
import { formatInTimeZone } from "@/lib/timezone"

/**
 * Roadmap phase 33 ("Simplify Business Pulse") — "mobile home should
 * show one or two plain-language conclusions... analytics answer
 * questions instead of creating homework." Pure: takes data the DB
 * shell already fetched (`lib/data.ts#getWeeklyPickupCounts`) and turns
 * it into a single sentence, or nothing at all when there's no real
 * signal to report — never a forced, empty "nothing to say" line.
 */

/** Below this, a day isn't meaningfully "busy" in relative terms — a
 * single pickup on one day of an otherwise-quiet week isn't a
 * conclusion worth a mobile headline. */
const BUSIEST_DAY_MIN_COUNT = 2

function isTomorrow(date: string, todayDate: string): boolean {
  const tomorrow = new Date(new Date(`${todayDate}T00:00:00.000Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
  return date === tomorrow
}

/** Finds the single busiest day among this week's pickup counts. Ties
 * are broken by whichever day comes first (Monday-first, same order
 * `getWeeklyPickupCounts` returns) — deterministic, same tie-break
 * convention as `lib/reservations/smart-defaults.ts#mostCommonString`.
 * `null` when nothing clears `BUSIEST_DAY_MIN_COUNT` — a quiet week is
 * not itself a conclusion worth surfacing. */
export function computeBusiestPickupDayHeadline(counts: DailyPickupCount[], todayDate: string, timeZone: string): string | null {
  let best: DailyPickupCount | null = null
  for (const c of counts) {
    if (c.count > (best?.count ?? 0)) best = c
  }
  if (!best || best.count < BUSIEST_DAY_MIN_COUNT) return null

  if (isTomorrow(best.date, todayDate)) return "Tomorrow is your busiest pickup day this week."

  const weekday = formatInTimeZone(`${best.date}T12:00:00.000Z`, timeZone, { weekday: "long" })
  return `${weekday} is your busiest pickup day this week.`
}

/** Composes every mobile business-pulse conclusion into a plain
 * sentence list, capped at 2 (the brief's own "one or two") — never
 * more, so this never grows back into a dashboard. Each conclusion is
 * independently optional; the caller passes `null` for one that has
 * nothing real to say. */
export function buildMobileBusinessPulseSummary(revenueHeadline: string | null, busiestDayHeadline: string | null): string[] {
  return [revenueHeadline, busiestDayHeadline].filter((line): line is string => line !== null).slice(0, 2)
}
