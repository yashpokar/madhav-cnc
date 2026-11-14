type Params = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

function amount(params: Params, key: string) {
  const text = first(params[key])
  const value = text ? Number(text) : NaN

  return Number.isFinite(value) && value >= 0 ? value : undefined
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function day(params: Params, key: string) {
  const text = first(params[key])

  return text && ISO.test(text) ? text : undefined
}

/** The from/to dates (ISO yyyy-mm-dd) picked in a date-range filter. */
export function readDateRange(params: Params) {
  return { from: day(params, 'from'), to: day(params, 'to') }
}

/** True when the date falls inside the picked range; open ends always pass. */
export function inDateRange(date: Date, params: Params) {
  const { from, to } = readDateRange(params)
  const value = date.toISOString().slice(0, 10)

  return (!from || value >= from) && (!to || value <= to)
}

/** The largest amount in a list: the right-hand end of the range slider. */
export function amountCeiling<T>(rows: T[], amount: (row: T) => number) {
  return rows.reduce((top, row) => Math.max(top, amount(row)), 0)
}

export function readListControls(params: Params) {
  return {
    min: amount(params, 'min'),
    max: amount(params, 'max'),
  }
}

/**
 * Applies the amount range and the date range. Sorting is separate: see
 * lib/table-sort.ts, driven by the column headings.
 */
export function applyListControls<T>(
  rows: T[],
  params: Params,
  pick: {
    date: (row: T) => Date
    amount: (row: T) => number
    /** Kept so existing calls compile; sorting by amount due is a column now. */
    due?: (row: T) => number
  },
) {
  const { min, max } = readListControls(params)

  return rows.filter((row) => {
    const value = pick.amount(row)

    return (
      (min === undefined || value >= min) &&
      (max === undefined || value <= max) &&
      inDateRange(pick.date(row), params)
    )
  })
}
