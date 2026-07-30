/**
 * Minimal CSV building, no dependency. Every export route uses this so
 * quoting/escaping is handled exactly once, not re-implemented per
 * resource.
 */

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

function escapeCsvField(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.header)).join(",")
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(","))
  // Leading BOM so Excel opens UTF-8 (Arabic customer/vehicle names, etc.)
  // without mangling the encoding — a real requirement for a Moroccan
  // audience, not decorative.
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n"
}

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Roadmap phase 48 (CSV Importer) — the read side of this file's own
 * write helper above. Hand-rolled, no dependency, same ethos as toCsv:
 * quoted fields (embedded commas/newlines, doubled `""` for a literal
 * quote), both `\r\n` and bare `\n` line endings, and a leading BOM
 * stripped (toCsv always writes one, so a re-imported export must
 * tolerate it). Wholly-empty trailing lines are dropped; an internal
 * blank line becomes a one-field `[""]` row for the caller to decide
 * what to do with, not silently swallowed.
 */
export function parseCsv(text: string): ParsedCsv {
  const input = stripBom(text)
  const records: string[][] = []
  let field = ""
  let record: string[] = []
  let inQuotes = false
  let i = 0

  function pushField() {
    record.push(field)
    field = ""
  }
  function pushRecord() {
    pushField()
    records.push(record)
    record = []
  }

  while (i < input.length) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ",") {
      pushField()
      i++
      continue
    }
    if (char === "\r") {
      if (input[i + 1] === "\n") i++
      pushRecord()
      i++
      continue
    }
    if (char === "\n") {
      pushRecord()
      i++
      continue
    }
    field += char
    i++
  }

  if (field.length > 0 || record.length > 0) {
    pushRecord()
  }

  while (records.length > 0 && records[records.length - 1].length === 1 && records[records.length - 1][0] === "") {
    records.pop()
  }

  if (records.length === 0) return { headers: [], rows: [] }
  const [headers, ...rows] = records
  return { headers, rows }
}
