import { describe, expect, it } from "vitest"

import { buildContractContext, type BuildContractContextInput } from "@/lib/contracts/context"
import { CONTRACT_VARIABLE_CATALOG } from "@/lib/contracts/variables"

const FULL_INPUT: BuildContractContextInput = {
  customer: {
    fullName: "Ahmed Tazi",
    phone: "+212 662-897431",
    email: "a.tazi@outlook.com",
    address: "12 Rue Atlas, Marrakech",
    nationality: "Moroccan",
    licenseNumber: "MA-204471",
    licenseExpiresAt: "2027-11-02",
    idDocumentNumber: "AB123456",
    dateOfBirth: "1990-01-01",
  },
  vehicle: {
    make: "Hyundai",
    model: "Accent",
    year: 2023,
    plate: "29981-A-6",
    color: "White",
    category: "compact",
    seats: 5,
    fuelType: "petrol",
    transmission: "manual",
  },
  reservation: {
    reference: "RB-3391",
    pickupAt: "2026-07-15T10:00:00Z",
    returnAt: "2026-07-19T10:00:00Z",
    pickupLocation: "Marrakech Menara Airport",
    returnLocation: "Marrakech Menara Airport",
    numDays: 4,
    dailyRateMad: 380,
    discountMad: 0,
    totalMad: 1520,
  },
  deposit: { expectedAmountMad: 3000, collectedAmountMad: 3000 },
  company: {
    name: "Atlas Rent Car",
    address: "45 Avenue Mohammed V",
    city: "Marrakech",
    country: "Morocco",
    taxId: "12345678",
    businessRegister: "RC-9988",
  },
  employeeFullName: "Youssef El Amrani",
  now: new Date("2026-07-15T09:00:00Z"),
}

describe("buildContractContext", () => {
  it("resolves every field with real values, hand-checked", () => {
    const context = buildContractContext(FULL_INPUT)
    expect(context["customer.fullName"]).toBe("Ahmed Tazi")
    expect(context["customer.licenseExpiresAt"]).toBe("2 Nov 2027")
    expect(context["vehicle.make"]).toBe("Hyundai")
    expect(context["vehicle.seats"]).toBe("5")
    expect(context["reservation.pickupAt"]).toBe("15 Jul 2026, 10:00")
    expect(context["pricing.totalMad"]).toBe("1,520 MAD")
    expect(context["deposit.collectedAmountMad"]).toBe("3,000 MAD")
    expect(context["company.name"]).toBe("Atlas Rent Car")
    expect(context["employee.fullName"]).toBe("Youssef El Amrani")
    expect(context["today.date"]).toBe("15 Jul 2026")
  })

  it("resolves every catalog entry to a defined (possibly empty) string when all inputs are present", () => {
    const context = buildContractContext(FULL_INPUT)
    for (const variable of CONTRACT_VARIABLE_CATALOG) {
      expect(context[variable.fieldPath], `missing key ${variable.fieldPath}`).toBeTypeOf("string")
    }
  })

  it("omits vehicle.* entirely when there is no assigned vehicle", () => {
    const context = buildContractContext({ ...FULL_INPUT, vehicle: null })
    expect(context["vehicle.make"]).toBeUndefined()
  })

  it("omits deposit.* entirely when no deposit exists", () => {
    const context = buildContractContext({ ...FULL_INPUT, deposit: null })
    expect(context["deposit.collectedAmountMad"]).toBeUndefined()
    expect(context["flags.depositCollected"]).toBe("false")
  })

  it("flags.discountApplied is true only when a real discount was given", () => {
    const withDiscount = buildContractContext({
      ...FULL_INPUT,
      reservation: { ...FULL_INPUT.reservation, discountMad: 100 },
    })
    expect(withDiscount["flags.discountApplied"]).toBe("true")
    expect(buildContractContext(FULL_INPUT)["flags.discountApplied"]).toBe("false")
  })

  describe("flags.youngDriver", () => {
    it("is true for a 20-year-old (birthday hasn't happened yet this year)", () => {
      const context = buildContractContext({
        ...FULL_INPUT,
        customer: { ...FULL_INPUT.customer, dateOfBirth: "2005-07-25" },
        reservation: { ...FULL_INPUT.reservation, pickupAt: "2026-07-21T10:00:00Z" },
      })
      expect(context["flags.youngDriver"]).toBe("true")
    })

    it("is false for a 36-year-old", () => {
      const context = buildContractContext({
        ...FULL_INPUT,
        customer: { ...FULL_INPUT.customer, dateOfBirth: "1990-01-01" },
        reservation: { ...FULL_INPUT.reservation, pickupAt: "2026-07-21T10:00:00Z" },
      })
      expect(context["flags.youngDriver"]).toBe("false")
    })

    it("is false on the exact day someone turns 25 (boundary: not young anymore)", () => {
      const context = buildContractContext({
        ...FULL_INPUT,
        customer: { ...FULL_INPUT.customer, dateOfBirth: "2001-07-21" },
        reservation: { ...FULL_INPUT.reservation, pickupAt: "2026-07-21T00:00:00Z" },
      })
      expect(context["flags.youngDriver"]).toBe("false")
    })

    it("is false when date of birth is unknown — never guesses young", () => {
      const context = buildContractContext({ ...FULL_INPUT, customer: { ...FULL_INPUT.customer, dateOfBirth: null } })
      expect(context["flags.youngDriver"]).toBe("false")
    })
  })
})
