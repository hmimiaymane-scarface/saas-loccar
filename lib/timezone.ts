/**
 * Timezone-correct conversion between a naive local datetime (what a
 * `<input type="datetime-local">` gives you — "2026-07-20T14:30", no
 * offset) and a UTC instant, using the COMPANY's configured IANA timezone
 * rather than whatever timezone the browser or the server process happens
 * to be running in.
 *
 * The default company timezone is Africa/Casablanca (Morocco has used a
 * fixed UTC+1 since 2018, with brief reversions to UTC+0 around Ramadan),
 * but this must not be hardcoded — every call site takes the timezone
 * explicitly from `session.company.timezone` so a future company in a
 * different zone works without touching this module.
 *
 * Uses the standard "round-trip through Intl" technique so DST and
 * non-standard offsets are handled correctly for any IANA zone, without
 * pulling in a date library.
 */

export const DEFAULT_TIMEZONE = "Africa/Casablanca"

/** Naive local datetime string ("2026-07-20T14:30") in `timeZone` -> UTC ISO string. */
export function zonedTimeToUtcIso(localDateTimeString: string, timeZone: string): string {
  const [datePart, timePart] = localDateTimeString.split("T")
  const [year, month, day] = datePart.split("-").map(Number)
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number)

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute)

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = dtf.formatToParts(new Date(utcGuess)).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})

  const asZoned = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  const offset = asZoned - utcGuess

  return new Date(utcGuess - offset).toISOString()
}

/** UTC ISO string -> naive local datetime string in `timeZone`, suitable
 * for pre-filling a `<input type="datetime-local">`. */
export function utcIsoToZonedLocal(iso: string, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = dtf.formatToParts(new Date(iso)).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})
  const hour = parts.hour === "24" ? "00" : parts.hour
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`
}

/** UTC ISO string -> a human-readable string in `timeZone`. */
export function formatInTimeZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(new Date(iso))
}
