type Params = Record<string, string | string[] | undefined>

export type SortDir = 'asc' | 'desc'
type Comparable = string | number | Date | boolean | null | undefined

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

/**
 * The column a table is sorted by, read from `?sort=<column>&dir=asc|desc`.
 * Only columns the page declared are accepted, so a stale or hand-typed link
 * falls back to the page's own default order.
 */
export function readSort(params: Params, columns: readonly string[]) {
  const key = first(params.sort)

  if (!key || !columns.includes(key)) return null

  return { key, dir: (first(params.dir) === 'desc' ? 'desc' : 'asc') as SortDir }
}

function rank(value: Comparable): number | string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'boolean') return value ? 1 : 0

  return value
}

/**
 * Sorts rows by the chosen column. Empty values always go last, text compares
 * case-insensitively with numbers read as numbers ("ORD-9" before "ORD-10"),
 * and equal rows keep the order they came in, so a page's default order
 * (usually newest first) still breaks ties.
 */
export function sortRows<T>(
  rows: T[],
  params: Params,
  columns: Record<string, (row: T) => Comparable>,
) {
  const sort = readSort(params, Object.keys(columns))

  if (!sort) return rows

  const pick = columns[sort.key]
  const factor = sort.dir === 'asc' ? 1 : -1

  return rows
    .map((row, index) => ({ row, index, value: rank(pick(row)) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index
      if (a.value === null) return 1
      if (b.value === null) return -1

      const order =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value), 'en', {
              numeric: true,
              sensitivity: 'base',
            })

      return order === 0 ? a.index - b.index : order * factor
    })
    .map((entry) => entry.row)
}
