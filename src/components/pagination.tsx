import { Button } from '@/components/catalyst/button'
import { PAGE_SIZES, type Paged } from '@/lib/pagination'

type Params = Record<string, string | string[] | undefined>

function hrefFor(
  params: Params,
  changes: Record<string, string | null>,
  pathname: string,
) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value
    if (single !== undefined) query.set(key, single)
  }

  for (const [key, value] of Object.entries(changes)) {
    if (value === null) query.delete(key)
    else query.set(key, value)
  }

  const text = query.toString()

  return text ? `${pathname}?${text}` : pathname
}

/** Page numbers to show: first, last, and a window around the current page. */
function windowOf(page: number, pages: number) {
  const wanted = new Set([1, pages, page - 1, page, page + 1])
  const list = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []

  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push('gap')
    out.push(n)
  })

  return out
}

export function Pagination({
  paged,
  params,
  pathname,
  pageKey = 'page',
  sizeKey = 'size',
}: {
  paged: Paged
  params: Params
  pathname: string
  pageKey?: string
  sizeKey?: string
}) {
  const { page, pages, size, total } = paged

  if (total <= PAGE_SIZES[0]) {
    return null
  }

  const link = (n: number) =>
    hrefFor(params, { [pageKey]: n === 1 ? null : String(n) }, pathname)
  const from = (page - 1) * size + 1
  const to = Math.min(page * size, total)

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden"
    >
      <p className="text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
        Showing {from}–{to} of {total}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
          <span className="mr-1">Rows</span>
          {PAGE_SIZES.map((option) => (
            <Button
              key={option}
              plain
              href={hrefFor(
                params,
                { [sizeKey]: String(option), [pageKey]: null },
                pathname,
              )}
              aria-current={option === size ? 'true' : undefined}
              className={option === size ? 'font-semibold' : undefined}
            >
              {option}
            </Button>
          ))}
        </div>

        {pages > 1 ? (
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Button plain href={link(page - 1)}>
                Previous
              </Button>
            ) : (
              <Button plain disabled>
                Previous
              </Button>
            )}
            {windowOf(page, pages).map((n, i) =>
              n === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-zinc-400">
                  …
                </span>
              ) : (
                <Button
                  key={n}
                  {...(n === page ? { outline: true as const } : { plain: true as const })}
                  href={link(n)}
                  aria-label={`Page ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                >
                  {n}
                </Button>
              ),
            )}
            {page < pages ? (
              <Button plain href={link(page + 1)}>
                Next
              </Button>
            ) : (
              <Button plain disabled>
                Next
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </nav>
  )
}
