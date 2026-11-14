type Params = Record<string, string | string[] | undefined>

export const LIST_SORTS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  amount_desc: 'Amount: high to low',
  amount_asc: 'Amount: low to high',
  due_desc: 'Amount due: high to low',
  due_asc: 'Amount due: low to high',
} as const

export type ListSort = keyof typeof LIST_SORTS

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
  const picked = first(params.sort)

  return {
    sort: picked && picked in LIST_SORTS ? (picked as ListSort) : undefined,
    min: amount(params, 'min'),
    max: amount(params, 'max'),
  }
}

/**
 * Applies the amount range and the chosen sort. With no sort chosen the list
 * keeps the order it came in, so the pages look the same until someone sorts.
 */
export function applyListControls<T>(
  rows: T[],
  params: Params,
  pick: {
    date: (row: T) => Date
    amount: (row: T) => number
    /** Only for lists that owe money, e.g. invoices. */
    due?: (row: T) => number
  },
) {
  const { sort, min, max } = readListControls(params)
  const kept = rows.filter((row) => {
    const value = pick.amount(row)

    return (
      (min === undefined || value >= min) &&
      (max === undefined || value <= max) &&
      inDateRange(pick.date(row), params)
    )
  })

  if (!sort) return kept

  const due = pick.due

  if ((sort === 'due_desc' || sort === 'due_asc') && !due) return kept

  const by = {
    newest: (a: T, b: T) => pick.date(b).getTime() - pick.date(a).getTime(),
    oldest: (a: T, b: T) => pick.date(a).getTime() - pick.date(b).getTime(),
    amount_desc: (a: T, b: T) => pick.amount(b) - pick.amount(a),
    amount_asc: (a: T, b: T) => pick.amount(a) - pick.amount(b),
    due_desc: (a: T, b: T) => (due ? due(b) - due(a) : 0),
    due_asc: (a: T, b: T) => (due ? due(a) - due(b) : 0),
  }[sort]

  return [...kept].sort(by)
}
