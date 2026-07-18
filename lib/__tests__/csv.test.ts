import { describe, expect, it } from "vitest"

import { toCsv } from "../csv"

describe("toCsv", () => {
  it("builds a header row from column labels, then one row per item", () => {
    const csv = toCsv(
      [{ name: "Ahmed", total: 1200 }],
      [
        { header: "Name", value: (r) => r.name },
        { header: "Total", value: (r) => r.total },
      ]
    )
    const lines = csv.replace(/^﻿/, "").split("\r\n")
    expect(lines[0]).toBe("Name,Total")
    expect(lines[1]).toBe("Ahmed,1200")
  })

  it("quotes and escapes fields containing commas, quotes or newlines", () => {
    const csv = toCsv(
      [{ text: 'Contains, a comma and "quotes"' }],
      [{ header: "Text", value: (r) => r.text }]
    )
    const lines = csv.replace(/^﻿/, "").split("\r\n")
    expect(lines[1]).toBe('"Contains, a comma and ""quotes"""')
  })

  it("renders null/undefined values as an empty field, not the literal string 'null'", () => {
    const csv = toCsv([{ value: null }], [{ header: "Value", value: (r) => r.value }])
    const lines = csv.replace(/^﻿/, "").split("\r\n")
    expect(lines[1]).toBe("")
  })

  it("prefixes the output with a UTF-8 BOM so Excel opens non-Latin text correctly", () => {
    const csv = toCsv([], [{ header: "A", value: () => "" }])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })
})
