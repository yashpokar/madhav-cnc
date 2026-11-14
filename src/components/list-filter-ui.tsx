import { Button } from '@/components/catalyst/button'
import { DateRangeFilter } from '@/components/date-range-filter'
import { EmptyState } from '@/components/form-banner'
import { Text } from '@/components/catalyst/text'
import { readDateRange, readListControls } from '@/lib/list-controls'

type Params = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

/** Link for a status tab: keeps sort, size and the date and amount filters. */
export function tabHref(pathname: string, params: Params, tab: string) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    const single = first(value)
    if (single !== undefined && !['tab', 'page'].includes(key)) query.set(key, single)
  }

  if (tab !== 'all') query.set('tab', tab)

  const text = query.toString()

  return text ? `${pathname}?${text}` : pathname
}

/** True when a tab, the search box, a date range or an amount range narrows the list. */
export function isFiltered(params: Params, tab: string) {
  const { min, max } = readListControls(params)
  const { from, to } = readDateRange(params)

  return (
    tab !== 'all' ||
    Boolean(first(params.q)?.trim()) ||
    min !== undefined ||
    max !== undefined ||
    from !== undefined ||
    to !== undefined
  )
}

/** Where "Clear filters" goes: the bare list, keeping only sort and page size. */
function clearHref(pathname: string, params: Params) {
  const query = new URLSearchParams()

  for (const key of ['sort', 'dir', 'size']) {
    const value = first(params[key])
    if (value) query.set(key, value)
  }

  const text = query.toString()

  return text ? `${pathname}?${text}` : pathname
}

/** "12 of 48 orders", shown only while something is narrowing the list. */
export function ResultCount({
  shown,
  total,
  noun,
  filtered,
}: {
  shown: number
  total: number
  noun: string
  filtered: boolean
}) {
  if (!filtered) return null

  return (
    <Text>
      {shown} of {total} {noun}
      {total === 1 ? '' : 's'}
    </Text>
  )
}

/** Empty state for a list: tells "nothing yet" apart from "nothing matches". */
export function ListEmpty({
  filtered,
  pathname,
  params,
  noun,
  emptyTitle,
  emptyDescription,
  action,
}: {
  filtered: boolean
  pathname: string
  params: Params
  noun: string
  emptyTitle: string
  emptyDescription: string
  action?: React.ReactNode
}) {
  if (filtered) {
    return (
      <EmptyState
        title="No matches"
        description={`No ${noun}s match the current search or filters. Clear them to see every ${noun}.`}
        action={<Button href={clearHref(pathname, params)}>Clear filters</Button>}
      />
    )
  }

  return <EmptyState title={emptyTitle} description={emptyDescription} action={action} />
}

/** A date-range-only filter, for lists that have no amount to range over. */
export function DateFilter({ params, pathname }: { params: Params; pathname: string }) {
  const { from, to } = readDateRange(params)
  const keep = Object.entries(params).filter(
    ([key, value]) => !['from', 'to', 'page'].includes(key) && typeof value === 'string',
  ) as [string, string][]
  const clear = new URLSearchParams(keep).toString()

  return (
    <form method="get" action={pathname} className="flex flex-wrap items-end gap-3 print:hidden">
      {keep.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <DateRangeFilter defaultFrom={from} defaultTo={to} autoSubmit className="w-full sm:w-auto" />
      <Button type="submit" outline>
        Apply
      </Button>
      {from || to ? (
        <Button plain href={clear ? `${pathname}?${clear}` : pathname}>
          Clear
        </Button>
      ) : null}
    </form>
  )
}
