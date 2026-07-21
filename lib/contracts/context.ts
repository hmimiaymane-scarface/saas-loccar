import type { ContractContext } from "./template-engine"

/**
 * Roadmap phase 10 — turns already-fetched, plain rows (no Supabase
 * dependency here; the DB-facing store does the fetching) into the
 * flat `{ fieldPath: displayValue }` bag `lib/contracts/template-engine.ts`
 * substitutes and evaluates conditions against. Every key here
 * corresponds to one entry in `lib/contracts/variables.ts`'s catalog —
 * kept in sync by hand, checked by
 * `lib/contracts/__tests__/context.test.ts`'s "every catalog entry
 * resolves to something" test.
 *
 * Dates are formatted with a small self-contained formatter (not
 * `lib/format.ts`'s `Intl`-based ones) specifically so this stays
 * fully deterministic in tests regardless of the host's ICU data, and
 * so a contract always shows a full day/month/year — `formatDate`
 * elsewhere in this app intentionally omits the year for compact UI
 * chrome, which is wrong for a legal document.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function formatContractDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function formatContractDateTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return `${formatContractDate(iso)}, ${hh}:${mm}`
}

function formatMoney(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} MAD`
}

export interface ContractCustomerInput {
  fullName: string
  phone: string
  email?: string | null
  address?: string | null
  nationality?: string | null
  licenseNumber?: string | null
  licenseExpiresAt?: string | null
  idDocumentNumber?: string | null
  dateOfBirth?: string | null
}

export interface ContractVehicleInput {
  make: string
  model: string
  year: number
  plate: string
  color?: string | null
  category: string
  seats?: number | null
  fuelType: string
  transmission: string
}

export interface ContractReservationInput {
  reference: string
  pickupAt: string
  returnAt: string
  pickupLocation?: string | null
  returnLocation?: string | null
  numDays: number
  dailyRateMad: number
  discountMad: number
  totalMad: number
}

export interface ContractDepositInput {
  expectedAmountMad: number
  collectedAmountMad: number
}

export interface ContractCompanyInput {
  name: string
  address?: string | null
  city?: string | null
  country: string
  taxId?: string | null
  businessRegister?: string | null
}

export interface BuildContractContextInput {
  customer: ContractCustomerInput
  vehicle: ContractVehicleInput | null
  reservation: ContractReservationInput
  deposit: ContractDepositInput | null
  company: ContractCompanyInput
  employeeFullName?: string | null
  now?: Date
}

/** Under 25 at pickup — the one bible-named conditional example
 * ("young driver") this schema actually has data for. Undefined date
 * of birth means "unknown," not "young": never flagged true without
 * real evidence. */
function isYoungDriver(dateOfBirth: string | null | undefined, pickupAt: string): boolean {
  if (!dateOfBirth) return false
  const dob = new Date(dateOfBirth)
  const pickup = new Date(pickupAt)
  let age = pickup.getUTCFullYear() - dob.getUTCFullYear()
  const hadBirthdayYet =
    pickup.getUTCMonth() > dob.getUTCMonth() ||
    (pickup.getUTCMonth() === dob.getUTCMonth() && pickup.getUTCDate() >= dob.getUTCDate())
  if (!hadBirthdayYet) age -= 1
  return age < 25
}

export function buildContractContext(input: BuildContractContextInput): ContractContext {
  const now = input.now ?? new Date()
  const { customer, vehicle, reservation, deposit, company } = input

  const context: ContractContext = {
    "customer.fullName": customer.fullName,
    "customer.phone": customer.phone,
    "customer.email": customer.email ?? "",
    "customer.address": customer.address ?? "",
    "customer.nationality": customer.nationality ?? "",
    "customer.licenseNumber": customer.licenseNumber ?? "",
    "customer.licenseExpiresAt": customer.licenseExpiresAt ? formatContractDate(customer.licenseExpiresAt) : "",
    "customer.idDocumentNumber": customer.idDocumentNumber ?? "",
    "customer.dateOfBirth": customer.dateOfBirth ? formatContractDate(customer.dateOfBirth) : "",

    "reservation.reference": reservation.reference,
    "reservation.pickupAt": formatContractDateTime(reservation.pickupAt),
    "reservation.returnAt": formatContractDateTime(reservation.returnAt),
    "reservation.pickupLocation": reservation.pickupLocation ?? "",
    "reservation.returnLocation": reservation.returnLocation ?? "",
    "reservation.numDays": String(reservation.numDays),

    "pricing.dailyRateMad": formatMoney(reservation.dailyRateMad),
    "pricing.discountMad": formatMoney(reservation.discountMad),
    "pricing.totalMad": formatMoney(reservation.totalMad),

    "company.name": company.name,
    "company.address": company.address ?? "",
    "company.city": company.city ?? "",
    "company.country": company.country,
    "company.taxId": company.taxId ?? "",
    "company.businessRegister": company.businessRegister ?? "",

    "employee.fullName": input.employeeFullName ?? "",

    "today.date": formatContractDate(now.toISOString()),

    "flags.youngDriver": String(isYoungDriver(customer.dateOfBirth, reservation.pickupAt)),
    "flags.depositCollected": String(Boolean(deposit && deposit.collectedAmountMad > 0)),
    "flags.discountApplied": String(reservation.discountMad > 0),
  }

  if (vehicle) {
    context["vehicle.make"] = vehicle.make
    context["vehicle.model"] = vehicle.model
    context["vehicle.year"] = String(vehicle.year)
    context["vehicle.plate"] = vehicle.plate
    context["vehicle.color"] = vehicle.color ?? ""
    context["vehicle.category"] = vehicle.category
    context["vehicle.seats"] = vehicle.seats != null ? String(vehicle.seats) : ""
    context["vehicle.fuelType"] = vehicle.fuelType
    context["vehicle.transmission"] = vehicle.transmission
  }

  if (deposit) {
    context["deposit.expectedAmountMad"] = formatMoney(deposit.expectedAmountMad)
    context["deposit.collectedAmountMad"] = formatMoney(deposit.collectedAmountMad)
  }

  return context
}
