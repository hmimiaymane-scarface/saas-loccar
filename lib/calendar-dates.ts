/** Pure date-grid helpers for the calendar page — kept dependency-free and
 * testable in isolation from any Supabase/React code. Weeks start on
 * Monday (matches Morocco/France convention). */

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Index (0-6, Monday=0) of `dateKey` relative to `weekStart`. Can be
 * negative or >6 when `dateKey` falls outside the visible week — callers
 * should clamp before using it as a grid column. */
export function dayIndexInWeek(dateKey: string, weekStart: Date): number {
  const d = parseDateKey(dateKey)
  d.setHours(0, 0, 0, 0)
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - start.getTime()) / 86400000)
}
