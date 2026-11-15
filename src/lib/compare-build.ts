import {
  SERIES_LENGTH,
  changeBetween,
  dayKey,
  daysBetween,
  lastYearStart,
  periodEnd,
  periodLabel,
  periodStart,
  periodTitle,
  shiftPeriod,
  windowOf,
  type Change,
  type PeriodType,
} from '@/lib/compare-math'

// Turns dated rows into the comparison matrix and trend series. Pure: the
// database layer (src/lib/queries/compare.ts) only fetches the rows.

export type MetricKey =
  | 'sales'
  | 'collections'
  | 'expenses'
  | 'purchases'
  | 'profit'
  | 'newCustomers'
  | 'orders'
  | 'invoices'
  | 'receivables'

export type MetricDef = {
  key: MetricKey
  label: string
  /** What the figure is, in plain words (shown as the row hint). */
  hint: string
  unit: 'money' | 'count'
  /** Which way is good news; "neutral" never shows red or green. */
  good: 'up' | 'down' | 'neutral'
  /** A "flow" adds up inside a period; a "stock" is a balance at a moment. */
  basis: 'flow' | 'stock'
}

export const METRICS: MetricDef[] = [
  { key: 'sales', label: 'Sales', hint: 'Issued invoices, total', unit: 'money', good: 'up', basis: 'flow' },
  { key: 'collections', label: 'Collections', hint: 'Payments received', unit: 'money', good: 'up', basis: 'flow' },
  { key: 'expenses', label: 'Expenses', hint: 'Expenses recorded, total', unit: 'money', good: 'down', basis: 'flow' },
  { key: 'purchases', label: 'Purchases', hint: 'Posted purchase bills, total', unit: 'money', good: 'neutral', basis: 'flow' },
  { key: 'profit', label: 'Net cash', hint: 'Collections minus expenses', unit: 'money', good: 'up', basis: 'flow' },
  { key: 'newCustomers', label: 'New customers', hint: 'Customers added', unit: 'count', good: 'up', basis: 'flow' },
  { key: 'orders', label: 'Orders', hint: 'Orders created, not cancelled', unit: 'count', good: 'up', basis: 'flow' },
  { key: 'invoices', label: 'Invoices issued', hint: 'Issued invoices', unit: 'count', good: 'up', basis: 'flow' },
  { key: 'receivables', label: 'Receivables', hint: 'Billed to date minus received to date, at period end', unit: 'money', good: 'down', basis: 'stock' },
]

export type Row = { date: Date; value: number }

/** The rows behind one metric; `opening` is the balance before the first row (stocks only). */
export type MetricRows = { rows: Row[]; opening?: number }

export type SeriesPoint = {
  start: string
  label: string
  value: number
  /** The same period one year earlier. */
  lastYear: number
  /** True for the period still in progress. */
  partial: boolean
}

export type MetricResult = MetricDef & {
  current: number
  previous: number
  lastYear: number
  vsPrevious: Change
  vsLastYear: Change
  series: SeriesPoint[]
}

export type CompareResult = {
  period: PeriodType
  asOf: string
  current: { from: string; to: string; label: string; elapsedDays: number; totalDays: number }
  /** The slices actually compared against: the same number of days into each. */
  previous: { from: string; to: string; label: string }
  lastYear: { from: string; to: string; label: string }
  metrics: MetricResult[]
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Earliest day any metric needs for this period type: the oldest series period, a year back. */
export function fetchFrom(type: PeriodType, today: Date): Date {
  const first = shiftPeriod(type, periodStart(type, today), -(SERIES_LENGTH - 1))

  return lastYearStart(type, first)
}

function sumBetween(rows: Row[], from: Date, to: Date) {
  let total = 0

  for (const row of rows) if (row.date >= from && row.date <= to) total += row.value

  return round2(total)
}

export function buildMetric(
  def: MetricDef,
  data: MetricRows,
  type: PeriodType,
  today: Date,
): MetricResult {
  const start = periodStart(type, today)
  const elapsed = daysBetween(start, today)
  const { rows } = data
  const opening = data.opening ?? 0

  // A flow adds up the days in a slice; a stock is the balance on its last day.
  const measure = (from: Date, to: Date) => {
    if (def.basis === 'flow') return sumBetween(rows, from, to)

    let balance = opening

    for (const row of rows) if (row.date <= to) balance += row.value

    return round2(Math.max(balance, 0))
  }

  const slice = (periodFirst: Date) => {
    const { from, to } = windowOf(type, periodFirst, elapsed)

    return measure(from, to)
  }

  const current = measure(start, today)
  const previous = slice(shiftPeriod(type, start, -1))
  const lastYear = slice(lastYearStart(type, start))

  const series: SeriesPoint[] = []

  for (let index = 0; index < SERIES_LENGTH; index += 1) {
    const first = shiftPeriod(type, start, index - (SERIES_LENGTH - 1))
    const partial = index === SERIES_LENGTH - 1
    const last = partial ? today : periodEnd(type, first)
    const yearAgo = lastYearStart(type, first)
    // The overlay's matching period is compared like for like, so a partial
    // current period sits next to the same days a year earlier.
    const yearAgoWindow = partial ? windowOf(type, yearAgo, elapsed) : { from: yearAgo, to: periodEnd(type, yearAgo) }

    series.push({
      start: dayKey(first),
      label: periodLabel(type, first),
      value: measure(first, last),
      lastYear: measure(yearAgoWindow.from, yearAgoWindow.to),
      partial,
    })
  }

  return {
    ...def,
    current,
    previous,
    lastYear,
    vsPrevious: changeBetween(current, previous),
    vsLastYear: changeBetween(current, lastYear),
    series,
  }
}

export function buildCompare(
  type: PeriodType,
  today: Date,
  data: Partial<Record<MetricKey, MetricRows>>,
): CompareResult {
  const start = periodStart(type, today)
  const elapsed = daysBetween(start, today)
  const prev = windowOf(type, shiftPeriod(type, start, -1), elapsed)
  const year = windowOf(type, lastYearStart(type, start), elapsed)

  return {
    period: type,
    asOf: dayKey(today),
    current: {
      from: dayKey(start),
      to: dayKey(today),
      label: periodTitle(type, start),
      elapsedDays: elapsed,
      totalDays: daysBetween(start, periodEnd(type, start)),
    },
    previous: { from: dayKey(prev.from), to: dayKey(prev.to), label: periodTitle(type, prev.from) },
    lastYear: { from: dayKey(year.from), to: dayKey(year.to), label: periodTitle(type, year.from) },
    metrics: METRICS.flatMap((def) => {
      const rows = data[def.key]

      return rows ? [buildMetric(def, rows, type, today)] : []
    }),
  }
}
