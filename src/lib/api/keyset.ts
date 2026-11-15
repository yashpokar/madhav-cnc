import { ApiError } from '@/lib/api/errors'
import type { CursorPosition } from '@/lib/api/cursor'

/**
 * Keyset paging for the read queries. A caller that wants a page passes
 * `{ take: limit + 1, after }`; web callers pass nothing and get what they always got.
 */
export type PageArgs = { take: number; after?: CursorPosition | null }

export type SortKind = 'date' | 'string'

/** The sort value a cursor carries, as the database column's type. */
function parseKey(kind: SortKind, k: string | number): Date | string {
  if (kind === 'string') return String(k)

  const date = new Date(String(k))

  if (Number.isNaN(date.getTime())) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid cursor', { fields: { cursor: 'Not a valid cursor' } })
  }

  return date
}

/** The sort value to put in a cursor for a row. */
export function keyOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

/**
 * "Rows after this one" for a list ordered by (`field` dir, id dir) with the id
 * in the same direction as the field. Returns an empty condition for the first page.
 */
// Returns `any` on purpose: a return-only generic (`<W extends object>`) is inferred
// as `object` by TypeScript 6 when handed to a Prisma `where`, which erased the
// relation types from every list query's result.
export function keysetClause(
  page: PageArgs | undefined,
  field: string,
  dir: 'asc' | 'desc',
  kind: SortKind,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (!page?.after) return {}

  const op = dir === 'desc' ? 'lt' : 'gt'
  const value = parseKey(kind, page.after.k)

  return {
    OR: [{ [field]: { [op]: value } }, { [field]: value, id: { [op]: page.after.id } }],
  }
}
