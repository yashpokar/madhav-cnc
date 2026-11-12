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

    return (min === undefined || value >= min) && (max === undefined || value <= max)
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
