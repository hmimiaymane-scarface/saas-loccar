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
