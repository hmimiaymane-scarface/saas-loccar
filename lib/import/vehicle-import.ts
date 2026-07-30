/**
 * Roadmap phase 48 (Excel/CSV Importer) — vehicle row validation and
 * duplicate detection. Pure, no Supabase dependency: the same enum
 * universes and required fields as
 * app/(dashboard)/fleet/actions.ts#readVehicleFields, so an imported
 * row and a manually-created one are held to the same rules.
 *
 * Duplicate detection uses the DB's own natural key — `vehicles` has a
 * `unique (company_id, registration_number)` constraint, so a plate
 * collision is a hard duplicate, not a scored/fuzzy one like customers.
 * `normalizeIdLike` (also used for customer licence/ID-document
 * matching) is reused here for the same reason it's reused there:
 * "MA 204471" and "ma-204471" should compare equal.
 */

import { normalizeIdLike } from "@/lib/customer-matching"
import { matchEnum, parseOptionalNumber, parseRequiredNumber, requireNonEmpty, parseFlexibleDate, trimmedOrNull } from "@/lib/import/shared"
import type { VehicleCategory, FuelType, Transmission } from "@/types/rental"

export const VEHICLE_CATEGORIES: VehicleCategory[] = ["economy", "compact", "suv", "van", "luxury"]
export const FUEL_TYPES: FuelType[] = ["petrol", "diesel", "hybrid", "electric"]
export const TRANSMISSIONS: Transmission[] = ["manual", "automatic"]

export interface VehicleImportRawRow {
  registrationNumber?: string
  make?: string
  model?: string
  year?: string
  category?: string
  dailyRate?: string
  fuelType?: string
  transmission?: string
  color?: string
  seats?: string
  depositAmount?: string
  odometerKm?: string
  insuranceExpiresOn?: string
  registrationExpiresOn?: string
  inspectionExpiresOn?: string
}

export interface VehicleImportData {
  registrationNumber: string
  make: string
  model: string
  year: number
  category: VehicleCategory
  fuelType: FuelType
  transmission: Transmission
  color: string | null
  seats: number | null
  dailyRate: number
  depositAmount: number | null
  odometerKm: number
  insuranceExpiresOn: string | null
  registrationExpiresOn: string | null
  inspectionExpiresOn: string | null
}

export interface VehicleImportRowResult {
  rowNumber: number
  data: VehicleImportData | null
  errors: string[]
  /** Set when the plate matches an existing vehicle or an earlier row
   * in the same file — never combined with a validation error (a row
   * that doesn't even parse can't be usefully flagged as a duplicate
   * of anything). */
  isDuplicate: boolean
  duplicateReason: string | null
}

/** Validates one already-column-mapped row. `existingPlates` and
 * `seenPlatesInFile` are both pre-normalized (via `normalizeIdLike`)
 * sets — the caller (see `validateVehicleImportRows` below) is
 * responsible for adding this row's own normalized plate to
 * `seenPlatesInFile` before validating the next row, so duplicate
 * detection is a pure read here, not a hidden side effect. */
export function validateVehicleImportRow(
  rowNumber: number,
  raw: VehicleImportRawRow,
  existingPlates: ReadonlySet<string>,
  seenPlatesInFile: ReadonlySet<string>
): VehicleImportRowResult {
  const errors: string[] = []

  const registrationNumber = requireNonEmpty(raw.registrationNumber, "Registration number")
  if (registrationNumber.error) errors.push(registrationNumber.error)

  const make = requireNonEmpty(raw.make, "Make")
  if (make.error) errors.push(make.error)

  const model = requireNonEmpty(raw.model, "Model")
  if (model.error) errors.push(model.error)

  const yearRaw = parseRequiredNumber(raw.year, "Year")
  if (yearRaw.error) errors.push(yearRaw.error)
  else if (yearRaw.value! < 1980 || yearRaw.value! > 2100) errors.push("Year must be between 1980 and 2100.")

  const categoryTrimmed = (raw.category ?? "").trim()
  let category: VehicleCategory | null = null
  if (!categoryTrimmed) errors.push("Category is required.")
  else {
    const result = matchEnum(categoryTrimmed, VEHICLE_CATEGORIES, "Category")
    if (result.error) errors.push(result.error)
    category = result.value
  }

  const dailyRate = parseRequiredNumber(raw.dailyRate, "Daily rate")
  if (dailyRate.error) errors.push(dailyRate.error)
  else if (dailyRate.value! < 0) errors.push("Daily rate can't be negative.")

  const fuelTypeTrimmed = (raw.fuelType ?? "").trim()
  let fuelType: FuelType = "petrol"
  if (fuelTypeTrimmed) {
    const result = matchEnum(fuelTypeTrimmed, FUEL_TYPES, "Fuel type")
    if (result.error) errors.push(result.error)
    else fuelType = result.value!
  }

  const transmissionTrimmed = (raw.transmission ?? "").trim()
  let transmission: Transmission = "manual"
  if (transmissionTrimmed) {
    const result = matchEnum(transmissionTrimmed, TRANSMISSIONS, "Transmission")
    if (result.error) errors.push(result.error)
    else transmission = result.value!
  }

  const seats = parseOptionalNumber(raw.seats, "Seats")
  if (seats.error) errors.push(seats.error)
  else if (seats.value != null && seats.value <= 0) errors.push("Seats must be a positive number.")

  const depositAmount = parseOptionalNumber(raw.depositAmount, "Deposit amount")
  if (depositAmount.error) errors.push(depositAmount.error)
  else if (depositAmount.value != null && depositAmount.value < 0) errors.push("Deposit amount can't be negative.")

  const odometerKm = parseOptionalNumber(raw.odometerKm, "Odometer")
  if (odometerKm.error) errors.push(odometerKm.error)
  else if (odometerKm.value != null && odometerKm.value < 0) errors.push("Odometer can't be negative.")

  const insuranceExpiresOn = parseFlexibleDate(raw.insuranceExpiresOn)
  if (insuranceExpiresOn.error) errors.push(`Insurance expiry: ${insuranceExpiresOn.error}`)

  const registrationExpiresOn = parseFlexibleDate(raw.registrationExpiresOn)
  if (registrationExpiresOn.error) errors.push(`Registration expiry: ${registrationExpiresOn.error}`)

  const inspectionExpiresOn = parseFlexibleDate(raw.inspectionExpiresOn)
  if (inspectionExpiresOn.error) errors.push(`Inspection expiry: ${inspectionExpiresOn.error}`)

  if (errors.length > 0) {
    return { rowNumber, data: null, errors, isDuplicate: false, duplicateReason: null }
  }

  const normalizedPlate = normalizeIdLike(registrationNumber.value!)
  let isDuplicate = false
  let duplicateReason: string | null = null
  if (existingPlates.has(normalizedPlate)) {
    isDuplicate = true
    duplicateReason = "A vehicle with this registration number already exists."
  } else if (seenPlatesInFile.has(normalizedPlate)) {
    isDuplicate = true
    duplicateReason = "Another row earlier in this file has the same registration number."
  }

  return {
    rowNumber,
    errors: [],
    data: {
      registrationNumber: registrationNumber.value!,
      make: make.value!,
      model: model.value!,
      year: yearRaw.value!,
      category: category!,
      fuelType,
      transmission,
      color: trimmedOrNull(raw.color),
      seats: seats.value,
      dailyRate: dailyRate.value!,
      depositAmount: depositAmount.value,
      odometerKm: odometerKm.value ?? 0,
      insuranceExpiresOn: insuranceExpiresOn.value,
      registrationExpiresOn: registrationExpiresOn.value,
      inspectionExpiresOn: inspectionExpiresOn.value,
    },
    isDuplicate,
    duplicateReason,
  }
}

/** Orchestrates the whole file: runs `validateVehicleImportRow` over
 * every row in order, feeding each row's own accepted plate into the
 * next row's intra-file dedup check (so duplicate rows still further
 * down the file also get flagged against each other, not just against
 * the first occurrence). A row that already has a validation error
 * doesn't get its plate added to the running set — an invalid plate
 * shouldn't cause a later, otherwise-valid row to be flagged as its
 * duplicate. */
export function validateVehicleImportRows(
  rawRows: VehicleImportRawRow[],
  existingPlates: ReadonlySet<string>
): VehicleImportRowResult[] {
  const seenPlatesInFile = new Set<string>()
  const results: VehicleImportRowResult[] = []

  rawRows.forEach((raw, index) => {
    const result = validateVehicleImportRow(index + 1, raw, existingPlates, seenPlatesInFile)
    results.push(result)
    if (result.data) {
      seenPlatesInFile.add(normalizeIdLike(result.data.registrationNumber))
    }
  })

  return results
}
