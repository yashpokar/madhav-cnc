import { ApiError } from '@/lib/api/errors'

/** The position of the last row of a page: its sort value and its id (tie-break). */
export type CursorPosition = { k: string | number; id: string }

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 100

/** Opaque to clients: base64url of a small JSON document. */
export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify([position.k, position.id]), 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): CursorPosition {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))

    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      (typeof parsed[0] === 'string' || typeof parsed[0] === 'number') &&
      typeof parsed[1] === 'string'
    ) {
      return { k: parsed[0], id: parsed[1] }
    }
  } catch {
    // fall through
  }

  throw new ApiError('VALIDATION_FAILED', 'Invalid cursor', {
    fields: { cursor: 'Not a valid cursor' },
  })
}

/** A page size from `?limit=`: default when missing or junk, never above the max. */
export function clampLimit(raw: unknown, fallback = DEFAULT_LIMIT, max = MAX_LIMIT): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)

  if (!Number.isFinite(n) || n < 1) return fallback

  return Math.min(Math.floor(n), max)
}

/**
 * Splits a query that fetched `limit + 1` rows into the page and the cursor
 * for the next one (null when this is the last page).
 */
export function pageOf<T>(
  rows: T[],
  limit: number,
  position: (row: T) => CursorPosition,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit)
  const hasMore = rows.length > limit

  return {
    items,
    nextCursor: hasMore && items.length > 0 ? encodeCursor(position(items[items.length - 1])) : null,
  }
}
