/**
 * Roadmap phase 10 requirement 1/3 — the fixed catalog of "real
 * business fields" a contract template variable can be mapped to, and
 * a condition can reference. Deliberately a closed, hand-maintained
 * list rather than reflection over the database schema: every entry
 * here is a field this codebase can actually resolve a real value for
 * (see `lib/contracts/context.ts`), so an AI-proposed mapping or an
 * owner-authored condition can never reference something that
 * silently renders blank.
 *
 * Grouped to match the bible's own variable categories (customer,
 * vehicle, reservation/rental, pricing, deposit, company, employee,
 * today) — this is intentionally narrower than the bible's full list:
 * "insurance" and "fuel policy" as separate structured fields don't
 * exist anywhere in this schema yet (no dedicated columns), so they're
 * not offered here rather than mapped to something that doesn't exist.
 * See docs/contracts.md for the honest list of what's out.
 */

export interface ContractVariableDef {
  fieldPath: string
  label: string
  group: "customer" | "vehicle" | "reservation" | "pricing" | "deposit" | "company" | "employee" | "today" | "flags"
}

export const CONTRACT_VARIABLE_CATALOG: ContractVariableDef[] = [
  { fieldPath: "customer.fullName", label: "Customer full name", group: "customer" },
  { fieldPath: "customer.phone", label: "Customer phone", group: "customer" },
  { fieldPath: "customer.email", label: "Customer email", group: "customer" },
  { fieldPath: "customer.address", label: "Customer address", group: "customer" },
  { fieldPath: "customer.nationality", label: "Customer nationality", group: "customer" },
  { fieldPath: "customer.licenseNumber", label: "Driving licence number", group: "customer" },
  { fieldPath: "customer.licenseExpiresAt", label: "Driving licence expiry", group: "customer" },
  { fieldPath: "customer.idDocumentNumber", label: "ID document number", group: "customer" },
  { fieldPath: "customer.dateOfBirth", label: "Customer date of birth", group: "customer" },

  { fieldPath: "vehicle.make", label: "Vehicle make", group: "vehicle" },
  { fieldPath: "vehicle.model", label: "Vehicle model", group: "vehicle" },
  { fieldPath: "vehicle.year", label: "Vehicle year", group: "vehicle" },
  { fieldPath: "vehicle.plate", label: "Registration plate", group: "vehicle" },
  { fieldPath: "vehicle.color", label: "Vehicle colour", group: "vehicle" },
  { fieldPath: "vehicle.category", label: "Vehicle category", group: "vehicle" },
  { fieldPath: "vehicle.seats", label: "Number of seats", group: "vehicle" },
  { fieldPath: "vehicle.fuelType", label: "Fuel type", group: "vehicle" },
  { fieldPath: "vehicle.transmission", label: "Transmission", group: "vehicle" },

  { fieldPath: "reservation.reference", label: "Reservation reference", group: "reservation" },
  { fieldPath: "reservation.pickupAt", label: "Pickup date/time", group: "reservation" },
  { fieldPath: "reservation.returnAt", label: "Return date/time", group: "reservation" },
  { fieldPath: "reservation.pickupLocation", label: "Pickup location", group: "reservation" },
  { fieldPath: "reservation.returnLocation", label: "Return location", group: "reservation" },
  { fieldPath: "reservation.numDays", label: "Number of rental days", group: "reservation" },

  { fieldPath: "pricing.dailyRateMad", label: "Daily rate", group: "pricing" },
  { fieldPath: "pricing.discountMad", label: "Discount", group: "pricing" },
  { fieldPath: "pricing.totalMad", label: "Total price", group: "pricing" },

  { fieldPath: "deposit.expectedAmountMad", label: "Deposit expected amount", group: "deposit" },
  { fieldPath: "deposit.collectedAmountMad", label: "Deposit collected amount", group: "deposit" },

  { fieldPath: "company.name", label: "Rental company name", group: "company" },
  { fieldPath: "company.address", label: "Rental company address", group: "company" },
  { fieldPath: "company.city", label: "Rental company city", group: "company" },
  { fieldPath: "company.country", label: "Rental company country", group: "company" },
  { fieldPath: "company.taxId", label: "Company tax ID", group: "company" },
  { fieldPath: "company.businessRegister", label: "Company business register number", group: "company" },

  { fieldPath: "employee.fullName", label: "Agent name (who generated the contract)", group: "employee" },

  { fieldPath: "today.date", label: "Today's date", group: "today" },

  // Precomputed booleans (always "true"/"false") for conditional
  // sections — requirement 4's two named examples (additional
  // insurance, young driver) only have real data for one of them; no
  // "additional insurance selected" concept exists anywhere in this
  // schema (no field, no add-ons table), so it's not offered — see
  // docs/contracts.md. "Young driver" and two other realistic
  // conditions ARE backed by real stored data.
  { fieldPath: "flags.youngDriver", label: "Young driver (under 25 at pickup)", group: "flags" },
  { fieldPath: "flags.depositCollected", label: "Deposit collected", group: "flags" },
  { fieldPath: "flags.discountApplied", label: "Discount applied", group: "flags" },
]

const VALID_FIELD_PATHS = new Set(CONTRACT_VARIABLE_CATALOG.map((v) => v.fieldPath))

export function isKnownContractField(fieldPath: string): boolean {
  return VALID_FIELD_PATHS.has(fieldPath)
}
