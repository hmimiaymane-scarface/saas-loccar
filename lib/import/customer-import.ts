/**
 * Roadmap phase 48 (Excel/CSV Importer) — customer row validation and
 * duplicate detection. Pure, no Supabase dependency.
 *
 * Unlike vehicles (a hard `unique(company_id, registration_number)`
 * constraint), customers have no DB-level uniqueness — duplicate
 * detection reuses the exact same scored matcher
 * (`lib/customer-matching.ts#findDuplicateMatches`) the manual
 * create-customer form already uses, at the same
 * `isLikelyDuplicate` bar (confidence >= DUPLICATE_LIKELY_THRESHOLD).
 * A row below that bar is not flagged, same restraint the interactive
 * form already applies to avoid false positives on a shared phone/name.
 */

import { findDuplicateMatches, type ExistingCustomerRecord, type DuplicateMatch } from "@/lib/customer-matching"
import { requireNonEmpty, parseFlexibleDate, trimmedOrNull } from "@/lib/import/shared"

export interface CustomerImportRawRow {
  fullName?: string
  phone?: string
  email?: string
  nationality?: string
  idDocumentNumber?: string
  licenseNumber?: string
  licenseExpiresOn?: string
  dateOfBirth?: string
  address?: string
  notes?: string
}

export interface CustomerImportData {
  fullName: string
  phone: string
  email: string | null
  nationality: string | null
  idDocumentNumber: string | null
  licenseNumber: string | null
  licenseExpiresOn: string | null
  dateOfBirth: string | null
  address: string | null
  notes: string | null
}

export interface CustomerImportRowResult {
  rowNumber: number
  data: CustomerImportData | null
  errors: string[]
  /** True only once a match crosses DUPLICATE_LIKELY_THRESHOLD — the
   * same bar the manual create-customer form uses. */
  isDuplicate: boolean
  duplicateMatches: DuplicateMatch[]
}

/** Validates one already-column-mapped row against `pool` — existing
 * customers plus, per `validateCustomerImportRows` below, every
 * already-accepted row earlier in the same file, so a cluster of rows
 * describing the same person gets flagged against each other too, not
 * just against what's already in the database. */
export function validateCustomerImportRow(
  rowNumber: number,
  raw: CustomerImportRawRow,
  pool: ExistingCustomerRecord[]
): CustomerImportRowResult {
  const errors: string[] = []

  const fullName = requireNonEmpty(raw.fullName, "Full name")
  if (fullName.error) errors.push(fullName.error)

  const phone = requireNonEmpty(raw.phone, "Phone")
  if (phone.error) errors.push(phone.error)

  const licenseExpiresOn = parseFlexibleDate(raw.licenseExpiresOn)
  if (licenseExpiresOn.error) errors.push(`Licence expiry: ${licenseExpiresOn.error}`)

  const dateOfBirth = parseFlexibleDate(raw.dateOfBirth)
  if (dateOfBirth.error) errors.push(`Date of birth: ${dateOfBirth.error}`)

  if (errors.length > 0) {
    return { rowNumber, data: null, errors, isDuplicate: false, duplicateMatches: [] }
  }

  const data: CustomerImportData = {
    fullName: fullName.value!,
    phone: phone.value!,
    email: trimmedOrNull(raw.email),
    nationality: trimmedOrNull(raw.nationality),
    idDocumentNumber: trimmedOrNull(raw.idDocumentNumber),
    licenseNumber: trimmedOrNull(raw.licenseNumber),
    licenseExpiresOn: licenseExpiresOn.value,
    dateOfBirth: dateOfBirth.value,
    address: trimmedOrNull(raw.address),
    notes: trimmedOrNull(raw.notes),
  }

  const duplicateMatches = findDuplicateMatches(
    {
      fullName: data.fullName,
      idDocumentNumber: data.idDocumentNumber,
      licenseNumber: data.licenseNumber,
      phone: data.phone,
      email: data.email,
      dateOfBirth: data.dateOfBirth,
    },
    pool
  )

  return {
    rowNumber,
    data,
    errors: [],
    isDuplicate: duplicateMatches.some((m) => m.isLikelyDuplicate),
    duplicateMatches,
  }
}

/** Orchestrates the whole file: every successfully-parsed row (valid
 * or flagged as a duplicate) is added to a running pool so later rows
 * are checked against it too — see the module doc comment. A row with
 * a validation error never joins the pool, same reasoning as the
 * vehicle importer's plate dedup: bad data shouldn't poison detection
 * for a later, otherwise-clean row. */
export function validateCustomerImportRows(
  rawRows: CustomerImportRawRow[],
  existingPool: ExistingCustomerRecord[]
): CustomerImportRowResult[] {
  const pool = [...existingPool]
  const results: CustomerImportRowResult[] = []

  rawRows.forEach((raw, index) => {
    const result = validateCustomerImportRow(index + 1, raw, pool)
    results.push(result)
    if (result.data) {
      pool.push({
        id: `import-row-${index + 1}`,
        fullName: result.data.fullName,
        idDocumentNumber: result.data.idDocumentNumber,
        licenseNumber: result.data.licenseNumber,
        phone: result.data.phone,
        email: result.data.email,
        dateOfBirth: result.data.dateOfBirth,
      })
    }
  })

  return results
}
