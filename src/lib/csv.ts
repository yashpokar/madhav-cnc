export type CsvCell = string | number | boolean | Date | null | undefined

function cellText(value: CsvCell): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  // Spreadsheet apps run cells starting with these as formulas.
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function escape(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens ₹ and Indic text correctly. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escape(cellText(cell))).join(','),
  )

  return `﻿${lines.join('\r\n')}\r\n`
}
