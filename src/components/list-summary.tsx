import { Button } from '@/components/catalyst/button'
import { clearHref } from '@/lib/list-href'

type Params = Record<string, string | string[] | undefined>

/**
 * The result count under a list's filters: "48 customers", or "12 of 48
 * customers" when a search or filter is narrowing the list, with a link to
 * clear them.
 */
export function ListSummary({
  shown,
  total,
  singular,
  plural,
  filtered,
  params,
  pathname,
}: {
  shown: number
  total: number
  singular: string
  plural: string
  filtered: boolean
  params: Params
  pathname: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400 print:hidden">
      <p>
        {filtered ? `${shown} of ${total}` : shown} {(filtered ? total : shown) === 1 ? singular : plural}
      </p>
      {filtered ? (
        <Button plain href={clearHref(pathname, params)}>
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
