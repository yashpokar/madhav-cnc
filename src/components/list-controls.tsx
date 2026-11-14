import { Button } from '@/components/catalyst/button'
import { DateRangeFilter } from '@/components/date-range-filter'
import { RangeSlider } from '@/components/range-slider'
import { readDateRange, readListControls } from '@/lib/list-controls'

type Params = Record<string, string | string[] | undefined>

/** Sort and amount-range controls. Other filters (tab, search) are kept. */
export function ListControls({
  params,
  pathname,
  amountLabel = 'Amount',
  ceiling,
}: {
  params: Params
  pathname: string
  amountLabel?: string
  /** Largest amount in the list, which sets the slider's scale. */
  ceiling: number
}) {
  const { min, max } = readListControls(params)
  const { from, to } = readDateRange(params)
  const active =
    min !== undefined ||
    max !== undefined ||
    from !== undefined ||
    to !== undefined
  const keep = Object.entries(params).filter(
    ([key, value]) => !['min', 'max', 'from', 'to', 'page'].includes(key) && typeof value === 'string',
  ) as [string, string][]
  const clear = new URLSearchParams(keep.filter(([key]) => key !== 'size')).toString()

  return (
    <form method="get" action={pathname} className="flex flex-wrap items-end gap-3 print:hidden">
      {keep.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <DateRangeFilter defaultFrom={from} defaultTo={to} className="w-full sm:w-auto" />
      <RangeSlider
        label={`${amountLabel} range`}
        ceiling={ceiling}
        defaultMin={min}
        defaultMax={max}
        className="w-full sm:w-72"
      />
      <Button type="submit" outline>
        Apply
      </Button>
      {active ? (
        <Button plain href={clear ? `${pathname}?${clear}` : pathname}>
          Clear
        </Button>
      ) : null}
    </form>
  )
}
