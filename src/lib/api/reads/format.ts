import { DEFAULT_LIMIT, decodeCursor, pageOf, type CursorPosition } from '@/lib/api/cursor'
import { keyOf, type PageArgs } from '@/lib/api/keyset'

/** A money amount as a decimal string with two places ("12345.50"). */
export const money = (value: number): string => (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2)

export const moneyOrNull = (value: number | null | undefined): string | null =>
  value === null || value === undefined ? null : money(value)

/** A quantity, rate-like or percentage value as a plain decimal string ("2.5", "18"). */
export const decimal = (value: number): string => String(value)

export const decimalOrNull = (value: number | null | undefined): string | null =>
  value === null || value === undefined ? null : decimal(value)

/** A date-only column (stored as UTC midnight) as "YYYY-MM-DD". */
export const day = (value: Date): string => value.toISOString().slice(0, 10)

export const dayOrNull = (value: Date | null | undefined): string | null => (value ? day(value) : null)

export const stamp = (value: Date): string => value.toISOString()

export const stampOrNull = (value: Date | null | undefined): string | null => (value ? stamp(value) : null)

/** Today's India date as a UTC-midnight Date (date columns have no time). */
export function todayIndia(now = new Date()): Date {
  return new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00Z`)
}

/** What a list query needs for one page: `limit + 1` rows, after the cursor. */
export function pageArgs(query: { limit?: number; cursor?: string }): { args: PageArgs; limit: number } {
  const limit = query.limit ?? DEFAULT_LIMIT

  return { limit, args: { take: limit + 1, after: query.cursor ? decodeCursor(query.cursor) : null } }
}

/** Turns the `limit + 1` rows into the page, the next cursor and `hasMore`. */
export function paged<T>(
  rows: T[],
  limit: number,
  position: (row: T) => CursorPosition,
): { items: T[]; meta: { nextCursor: string | null; hasMore: boolean } } {
  const { items, nextCursor } = pageOf(rows, limit, position)

  return { items, meta: { nextCursor, hasMore: nextCursor !== null } }
}

/** A cursor position from a row's sort value (a Date becomes an ISO string) and id. */
export const at = (key: Date | string, id: string): CursorPosition => ({ k: keyOf(key), id })
