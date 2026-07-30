/**
 * Roadmap phase 48 (Excel/CSV Importer) — small parsing helpers shared
 * by the vehicle and customer row validators. Pure, no Supabase
 * dependency, so they run identically client-side (for the wizard's
 * live preview) and if ever re-checked server-side.
 */

export function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed === "" ? null : trimmed
}

/** Accepts an ISO "YYYY-MM-DD" directly, or falls back to whatever
 * `Date` can parse (e.g. "3/14/2028", "14 March 2028") and reformats it
 * to ISO — spreadsheets rarely use ISO dates natively. Returns
 * `{value: null, error: null}` for a blank/absent value (fields calling
 * this are optional; the caller decides whether blank is itself an
 * error for a required date). */
export function parseFlexibleDate(value: string | undefined): { value: string | null; error: string | null } {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return { value: null, error: null }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = new Date(`${trimmed}T00:00:00Z`)
    if (!Number.isNaN(iso.getTime())) return { value: trimmed, error: null }
  }

  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    // Read back the *local* calendar date `Date` parsed the string
    // into, not its UTC equivalent -- a plain date like "March 14,
    // 2028" has no timezone of its own, and going through
    // toISOString() would shift it to the 13th or 15th depending on
    // the server's local offset from UTC.
    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, "0")
    const day = String(parsed.getDate()).padStart(2, "0")
    return { value: `${year}-${month}-${day}`, error: null }
  }

  return { value: null, error: `"${trimmed}" is not a valid date.` }
}

/** Tolerates thousand separators ("1,200" -> 1200) since that's a
 * common spreadsheet number format. */
function parseNumberLoose(trimmed: string): number {
  return Number(trimmed.replace(/,/g, ""))
}

export function parseRequiredNumber(value: string | undefined, label: string): { value: number | null; error: string | null } {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return { value: null, error: `${label} is required.` }
  const num = parseNumberLoose(trimmed)
  if (Number.isNaN(num)) return { value: null, error: `${label} must be a number.` }
  return { value: num, error: null }
}

export function parseOptionalNumber(value: string | undefined, label: string): { value: number | null; error: string | null } {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return { value: null, error: null }
  const num = parseNumberLoose(trimmed)
  if (Number.isNaN(num)) return { value: null, error: `${label} must be a number.` }
  return { value: num, error: null }
}

export function requireNonEmpty(value: string | undefined, label: string): { value: string | null; error: string | null } {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return { value: null, error: `${label} is required.` }
  return { value: trimmed, error: null }
}

/** Case-insensitive match against a fixed enum universe (e.g. vehicle
 * category, fuel type) -- returns the canonical lowercase value the
 * DB's own CHECK constraint expects, or an error naming the allowed
 * values if the cell doesn't match any of them (blank is handled by
 * the caller, since "blank means default" vs "blank is an error"
 * varies by field). */
export function matchEnum<T extends string>(value: string, allowed: readonly T[], label: string): { value: T | null; error: string | null } {
  const normalized = value.trim().toLowerCase()
  const match = allowed.find((option) => option.toLowerCase() === normalized)
  if (!match) return { value: null, error: `${label} must be one of: ${allowed.join(", ")}.` }
  return { value: match, error: null }
}
