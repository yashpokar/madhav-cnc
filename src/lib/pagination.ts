export const PAGE_SIZES = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

type Params = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

/**
 * Takes one page out of an already filtered list. The page number is clamped,
 * so a stale link to page 9 of a list that has since shrunk still shows rows.
 */
export function paginate<T>(
  items: T[],
  params: Params,
  { pageKey = 'page', sizeKey = 'size' }: { pageKey?: string; sizeKey?: string } = {},
) {
  const requestedSize = Number(first(params[sizeKey]))
  const size = (PAGE_SIZES as readonly number[]).includes(requestedSize)
    ? requestedSize
    : DEFAULT_PAGE_SIZE
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / size))
  const requestedPage = Math.floor(Number(first(params[pageKey])))
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    pages,
  )

  return {
    rows: items.slice((page - 1) * size, page * size),
    total,
    page,
    pages,
    size,
  }
}

export type Paged = ReturnType<typeof paginate>
