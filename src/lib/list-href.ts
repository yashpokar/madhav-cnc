type Params = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

/** Parameters that describe how a list is shown, not what it contains. */
const VIEW_KEYS = ['sort', 'dir', 'size']

/**
 * A link to the same list with some parameters changed (null removes one).
 * Everything else is kept; the page number always resets to the first page.
 */
export function hrefWith(
  pathname: string,
  params: Params,
  changes: Record<string, string | null>,
) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    const single = first(value)
    if (single !== undefined && key !== 'page') query.set(key, single)
  }

  for (const [key, value] of Object.entries(changes)) {
    if (value === null) query.delete(key)
    else query.set(key, value)
  }

  const text = query.toString()

  return text ? `${pathname}?${text}` : pathname
}

/** A link to the list with every search and filter removed; sorting and page size stay. */
export function clearHref(pathname: string, params: Params) {
  const query = new URLSearchParams()

  for (const key of VIEW_KEYS) {
    const value = first(params[key])
    if (value !== undefined) query.set(key, value)
  }

  const text = query.toString()

  return text ? `${pathname}?${text}` : pathname
}
