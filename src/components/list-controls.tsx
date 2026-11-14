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
  showClear = true,
}: {
  params: Params
  pathname: string
  amountLabel?: string
  /** Largest amount in the list, which sets the slider's scale. */
  ceiling: number
  /** Offer a Clear link for the date and amount filters. */
  showClear?: boolean
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
    <form method="get" action={pathname} className="contents print:hidden">
      {keep.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <DateRangeFilter defaultFrom={from} defaultTo={to} autoSubmit label="Date" className="w-full sm:w-auto" />
      <RangeSlider
        label={`${amountLabel} range`}
        ceiling={ceiling}
        defaultMin={min}
        defaultMax={max}
        autoSubmit
        className="w-full sm:w-72"
      />
      {active && showClear ? (
        <Button plain href={clear ? `${pathname}?${clear}` : pathname}>
          Clear
        </Button>
      ) : null}
    </form>
  )
}
