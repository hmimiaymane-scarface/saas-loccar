import { describe, expect, it } from "vitest"

import { toCsv, parseCsv } from "../csv"

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

describe("parseCsv", () => {
  it("splits a simple header + rows", () => {
    const result = parseCsv("Make,Model,Year\nToyota,Yaris,2023\nRenault,Clio,2022\n")
    expect(result.headers).toEqual(["Make", "Model", "Year"])
    expect(result.rows).toEqual([
      ["Toyota", "Yaris", "2023"],
      ["Renault", "Clio", "2022"],
    ])
  })

  it("handles a quoted field containing a comma", () => {
    const result = parseCsv('Name,Address\n"Bennani, Karim","123 Main St"\n')
    expect(result.rows).toEqual([["Bennani, Karim", "123 Main St"]])
  })

  it("unescapes a doubled quote inside a quoted field", () => {
    const result = parseCsv('Text\n"She said ""hi"" to me"\n')
    expect(result.rows).toEqual([['She said "hi" to me']])
  })

  it("handles a quoted field containing an embedded newline", () => {
    const result = parseCsv('Notes\n"Line one\nLine two"\n')
    expect(result.rows).toEqual([["Line one\nLine two"]])
  })

  it("handles CRLF line endings the same as bare LF", () => {
    const result = parseCsv("A,B\r\n1,2\r\n3,4\r\n")
    expect(result.headers).toEqual(["A", "B"])
    expect(result.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ])
  })

  it("strips a leading UTF-8 BOM", () => {
    const result = parseCsv("﻿A,B\n1,2\n")
    expect(result.headers).toEqual(["A", "B"])
  })

  it("drops a wholly-empty trailing line but keeps an internal blank row", () => {
    const result = parseCsv("A,B\n1,2\n\n3,4\n\n")
    expect(result.rows).toEqual([["1", "2"], [""], ["3", "4"]])
  })

  it("returns empty headers/rows for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] })
  })

  it("round-trips toCsv's own output back into the original values", () => {
    const csv = toCsv(
      [
        { name: "Bennani, Karim", note: 'Said "hi"' },
        { name: "Ahmed", note: "Line one\nLine two" },
      ],
      [
        { header: "Name", value: (r) => r.name },
        { header: "Note", value: (r) => r.note },
      ]
    )
    const result = parseCsv(csv)
    expect(result.headers).toEqual(["Name", "Note"])
    expect(result.rows).toEqual([
      ["Bennani, Karim", 'Said "hi"'],
      ["Ahmed", "Line one\nLine two"],
    ])
  })
})
