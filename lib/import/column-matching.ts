/**
 * Roadmap phase 48 (Excel/CSV Importer) — pure column-matching logic, no
 * Supabase dependency, so it's unit-testable and can run directly in the
 * browser against a client-parsed file (see lib/csv.ts#parseCsv) before
 * anything is sent to a server action.
 *
 * A target field is one column the importer knows how to fill in on a
 * vehicle/customer row. `aliases` covers the header spellings a real
 * spreadsheet is likely to use (including this app's own CSV exports —
 * see app/api/exports/fleet/route.ts and app/api/exports/customers/route.ts,
 * whose header labels are included as aliases so a re-import of an
 * export auto-matches every column with no manual work).
 */

export interface ImportTargetField {
  key: string
  label: string
  required: boolean
  aliases: string[]
}

export const VEHICLE_IMPORT_FIELDS: ImportTargetField[] = [
  { key: "registrationNumber", label: "Registration number", required: true, aliases: ["plate", "license plate", "licence plate", "plate number", "reg no", "reg number"] },
  { key: "make", label: "Make", required: true, aliases: ["brand"] },
  { key: "model", label: "Model", required: true, aliases: [] },
  { key: "year", label: "Year", required: true, aliases: ["model year"] },
  { key: "category", label: "Category", required: true, aliases: ["vehicle category", "type"] },
  { key: "dailyRate", label: "Daily rate", required: true, aliases: ["daily rate (mad)", "rate", "price per day", "daily price"] },
  { key: "fuelType", label: "Fuel type", required: false, aliases: ["fuel"] },
  { key: "transmission", label: "Transmission", required: false, aliases: ["gearbox"] },
  { key: "color", label: "Color", required: false, aliases: ["colour"] },
  { key: "seats", label: "Seats", required: false, aliases: ["seat count"] },
  { key: "depositAmount", label: "Deposit amount", required: false, aliases: ["deposit", "security deposit"] },
  { key: "odometerKm", label: "Odometer (km)", required: false, aliases: ["odometer", "mileage", "mileage (km)"] },
  { key: "insuranceExpiresOn", label: "Insurance expires on", required: false, aliases: ["insurance expires", "insurance expiry"] },
  { key: "registrationExpiresOn", label: "Registration expires on", required: false, aliases: ["registration expires", "registration expiry"] },
  { key: "inspectionExpiresOn", label: "Inspection expires on", required: false, aliases: ["inspection expires", "inspection expiry"] },
]

export const CUSTOMER_IMPORT_FIELDS: ImportTargetField[] = [
  { key: "fullName", label: "Full name", required: true, aliases: ["name", "customer name"] },
  { key: "phone", label: "Phone", required: true, aliases: ["phone number", "mobile", "telephone"] },
  { key: "email", label: "Email", required: false, aliases: ["email address"] },
  { key: "nationality", label: "Nationality", required: false, aliases: [] },
  { key: "idDocumentNumber", label: "ID document number", required: false, aliases: ["id number", "passport number", "national id", "cin"] },
  { key: "licenseNumber", label: "Licence number", required: false, aliases: ["license number", "driving licence", "driver's license", "licence no"] },
  { key: "licenseExpiresOn", label: "Licence expires on", required: false, aliases: ["license expires", "licence expires", "licence expiry", "license expiry"] },
  { key: "dateOfBirth", label: "Date of birth", required: false, aliases: ["birth date", "dob"] },
  { key: "address", label: "Address", required: false, aliases: [] },
  { key: "notes", label: "Notes", required: false, aliases: ["note", "comment", "comments"] },
]

/** Lowercased, punctuation collapsed to a single space, trimmed — so
 * "Daily Rate (MAD)" and "daily_rate_mad" both normalize the same way
 * as a plain alias like "daily rate mad" would. */
export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Assigns at most one header (by index) to each target field: the
 * field's own label or one of its aliases, matched against every header
 * not already claimed by an earlier field in `fields`' own order. A
 * header that matches nothing is simply left unmapped for the user to
 * assign by hand; a field with no matching header maps to `null`, same
 * reason. Never assigns the same header index to two fields, even if a
 * spreadsheet has an ambiguous duplicate column name — first field to
 * claim it wins, and the duplicate stays unmapped rather than silently
 * overwriting the first assignment.
 */
export function suggestColumnMapping(
  headers: string[],
  fields: ImportTargetField[]
): Record<string, number | null> {
  const normalizedHeaders = headers.map(normalizeHeader)
  const claimed = new Set<number>()
  const mapping: Record<string, number | null> = {}

  for (const field of fields) {
    const candidates = [field.label, ...field.aliases].map(normalizeHeader)
    let matchIndex: number | null = null
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (claimed.has(i)) continue
      if (candidates.includes(normalizedHeaders[i])) {
        matchIndex = i
        break
      }
    }
    mapping[field.key] = matchIndex
    if (matchIndex !== null) claimed.add(matchIndex)
  }

  return mapping
}
