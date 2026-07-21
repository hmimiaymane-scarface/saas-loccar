import { describe, expect, it } from "vitest"

import { evaluateCondition, substituteVariables, renderContractSections, type TemplateSection } from "@/lib/contracts/template-engine"

describe("evaluateCondition", () => {
  it("is true when there is no condition", () => {
    expect(evaluateCondition(null, {})).toBe(true)
  })

  it("exists: true when the field has a non-empty value", () => {
    expect(evaluateCondition({ fieldPath: "customer.email", operator: "exists" }, { "customer.email": "a@b.com" })).toBe(true)
  })

  it("exists: false when the field is missing entirely", () => {
    expect(evaluateCondition({ fieldPath: "customer.email", operator: "exists" }, {})).toBe(false)
  })

  it("exists: false when the field resolved to an empty string", () => {
    expect(evaluateCondition({ fieldPath: "customer.email", operator: "exists" }, { "customer.email": "" })).toBe(false)
  })

  it("exists: false when the field is only whitespace", () => {
    expect(evaluateCondition({ fieldPath: "customer.email", operator: "exists" }, { "customer.email": "   " })).toBe(false)
  })

  it("equals: true on an exact match", () => {
    expect(evaluateCondition({ fieldPath: "flags.youngDriver", operator: "equals", value: "true" }, { "flags.youngDriver": "true" })).toBe(
      true
    )
  })

  it("equals: false on a mismatch", () => {
    expect(
      evaluateCondition({ fieldPath: "flags.youngDriver", operator: "equals", value: "true" }, { "flags.youngDriver": "false" })
    ).toBe(false)
  })

  it("equals: false when the field is missing", () => {
    expect(evaluateCondition({ fieldPath: "flags.youngDriver", operator: "equals", value: "true" }, {})).toBe(false)
  })
})

describe("substituteVariables", () => {
  it("replaces every known placeholder", () => {
    const result = substituteVariables("Renter: {{customer.fullName}}, Vehicle: {{vehicle.plate}}.", {
      "customer.fullName": "Ahmed Tazi",
      "vehicle.plate": "12345-A-6",
    })
    expect(result).toBe("Renter: Ahmed Tazi, Vehicle: 12345-A-6.")
  })

  it("leaves an unresolved placeholder visibly untouched", () => {
    const result = substituteVariables("Email: {{customer.email}}.", { "customer.fullName": "Ahmed Tazi" })
    expect(result).toBe("Email: {{customer.email}}.")
  })

  it("leaves a resolved-but-empty-string placeholder untouched too", () => {
    const result = substituteVariables("Email: {{customer.email}}.", { "customer.email": "" })
    expect(result).toBe("Email: {{customer.email}}.")
  })

  it("handles the same placeholder appearing more than once", () => {
    const result = substituteVariables("{{customer.fullName}} agrees. Signed, {{customer.fullName}}.", {
      "customer.fullName": "Ahmed Tazi",
    })
    expect(result).toBe("Ahmed Tazi agrees. Signed, Ahmed Tazi.")
  })

  it("tolerates stray whitespace inside the braces", () => {
    const result = substituteVariables("{{ customer.fullName }}", { "customer.fullName": "Ahmed Tazi" })
    expect(result).toBe("Ahmed Tazi")
  })
})

describe("renderContractSections", () => {
  const context = {
    "customer.fullName": "Ahmed Tazi",
    "flags.youngDriver": "false",
    "flags.depositCollected": "true",
  }

  it("includes unconditional sections and substitutes their variables", () => {
    const sections: TemplateSection[] = [{ id: "s1", title: "Renter", bodyText: "Name: {{customer.fullName}}", condition: null }]
    expect(renderContractSections(sections, context)).toEqual([{ id: "s1", title: "Renter", body: "Name: Ahmed Tazi" }])
  })

  it("drops a section whose condition fails", () => {
    const sections: TemplateSection[] = [
      { id: "s1", title: "Young driver fee", bodyText: "A young-driver surcharge applies.", condition: { fieldPath: "flags.youngDriver", operator: "equals", value: "true" } },
    ]
    expect(renderContractSections(sections, context)).toEqual([])
  })

  it("keeps a section whose condition passes", () => {
    const sections: TemplateSection[] = [
      { id: "s1", title: "Deposit", bodyText: "A deposit was collected.", condition: { fieldPath: "flags.depositCollected", operator: "equals", value: "true" } },
    ]
    expect(renderContractSections(sections, context)).toEqual([{ id: "s1", title: "Deposit", body: "A deposit was collected." }])
  })

  it("preserves section order and filters a mix in one pass", () => {
    const sections: TemplateSection[] = [
      { id: "s1", title: "Renter", bodyText: "{{customer.fullName}}", condition: null },
      { id: "s2", title: "Young driver fee", bodyText: "surcharge", condition: { fieldPath: "flags.youngDriver", operator: "equals", value: "true" } },
      { id: "s3", title: "Deposit", bodyText: "deposit noted", condition: { fieldPath: "flags.depositCollected", operator: "equals", value: "true" } },
    ]
    expect(renderContractSections(sections, context)).toEqual([
      { id: "s1", title: "Renter", body: "Ahmed Tazi" },
      { id: "s3", title: "Deposit", body: "deposit noted" },
    ])
  })
})
