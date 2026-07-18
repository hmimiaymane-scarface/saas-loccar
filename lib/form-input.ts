import { ActionError } from "@/lib/auth/guard"
import { zonedTimeToUtcIso } from "@/lib/timezone"

/**
 * Minimal FormData parsing helpers for server actions. Deliberately not a
 * schema-validation library — the forms in this phase are a handful of
 * flat fields, and hand-rolled checks keep the dependency list at zero
 * without sacrificing clarity. Revisit with a schema library (e.g. zod) if
 * a future phase's forms get meaningfully more nested.
 */

export function requiredString(formData: FormData, key: string, label = key): string {
  const value = String(formData.get(key) ?? "").trim()
  if (!value) throw new ActionError(`${label} is required.`)
  return value
}

export function optionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim()
  return value || null
}

export function requiredNumber(formData: FormData, key: string, label = key): number {
  const raw = String(formData.get(key) ?? "").trim()
  const value = Number(raw)
  if (!raw || Number.isNaN(value)) throw new ActionError(`${label} must be a number.`)
  return value
}

export function optionalNumber(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim()
  if (!raw) return null
  const value = Number(raw)
  if (Number.isNaN(value)) throw new ActionError(`${key} must be a number.`)
  return value
}

export function requiredEnum<T extends string>(
  formData: FormData,
  key: string,
  allowed: readonly T[],
  label = key
): T {
  const value = String(formData.get(key) ?? "").trim()
  if (!allowed.includes(value as T)) {
    throw new ActionError(`${label} must be one of: ${allowed.join(", ")}.`)
  }
  return value as T
}

/**
 * Reads a `<input type="datetime-local">` value ("2026-07-20T14:30", no
 * offset) and converts it to a UTC ISO string using the company's
 * timezone — never the server process's ambient timezone. See
 * lib/timezone.ts for why a plain `new Date(raw).toISOString()` would be
 * wrong here.
 */
export function requiredIsoDateTime(
  formData: FormData,
  key: string,
  timeZone: string,
  label = key
): string {
  const raw = String(formData.get(key) ?? "").trim()
  if (!raw) throw new ActionError(`${label} is required.`)
  const iso = zonedTimeToUtcIso(raw, timeZone)
  if (Number.isNaN(new Date(iso).getTime())) throw new ActionError(`${label} is not a valid date.`)
  return iso
}
