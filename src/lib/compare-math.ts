// Pure period math for the week / month / year comparison. No database, no clock
// of its own. Every date is a UTC-midnight Date standing for an India calendar
// day (date columns have no time; "today" comes from todayInIndia). Weeks are ISO
// (Monday first). The app has no financial-year setting, so "year" is the
// calendar year.

export type PeriodType = 'week' | 'month' | 'year'

export const PERIOD_TYPES: PeriodType[] = ['week', 'month', 'year']

/** How many periods the trend shows, the current one included. */
export const SERIES_LENGTH = 12

const DAY = 86_400_000

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY)

export const dayKey = (date: Date) => date.toISOString().slice(0, 10)

/** The first day of the period that holds `date`. */
export function periodStart(type: PeriodType, date: Date): Date {
  if (type === 'week') return addDays(date, -((date.getUTCDay() + 6) % 7))
  if (type === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
}

/** The start of the period `count` periods after (or before, if negative) `start`. */
export function shiftPeriod(type: PeriodType, start: Date, count: number): Date {
  if (type === 'week') return addDays(start, count * 7)
  if (type === 'month') return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + count, 1))

  return new Date(Date.UTC(start.getUTCFullYear() + count, 0, 1))
}

/** The last day of the period that starts on `start`. */
export function periodEnd(type: PeriodType, start: Date): Date {
  return addDays(shiftPeriod(type, start, 1), -1)
}

/**
 * The same period one year earlier. A week goes back 52 weeks (364 days) so it
 * is still a Monday-to-Sunday week at about the same time of year; a month goes
 * back 12 months; a year goes back one year (so it equals the previous period).
 */
export function lastYearStart(type: PeriodType, start: Date): Date {
  if (type === 'week') return addDays(start, -364)
  if (type === 'month') return shiftPeriod('month', start, -12)

  return shiftPeriod('year', start, -1)
}

/** Whole days from `a` to `b`, both inclusive. */
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY) + 1

/**
 * The slice of the period starting at `start` that matches `elapsed` days into
 * the current one, never running past the period's own end. This is what makes
 * "this month so far" fair against "the first N days of last month".
 */
export function windowOf(type: PeriodType, start: Date, elapsed: number) {
  const full = periodEnd(type, start)
  const end = addDays(start, elapsed - 1)

  return { from: start, to: end > full ? full : end }
}

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' })
const SHORT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function periodLabel(type: PeriodType, start: Date): string {
  if (type === 'week') return SHORT.format(start)
  if (type === 'month') return `${MONTH.format(start)} ${String(start.getUTCFullYear()).slice(2)}`

  return String(start.getUTCFullYear())
}

export function periodTitle(type: PeriodType, start: Date): string {
  if (type === 'week') return `Week of ${SHORT.format(start)} ${start.getUTCFullYear()}`
  if (type === 'month') return `${MONTH.format(start)} ${start.getUTCFullYear()}`

  return String(start.getUTCFullYear())
}

/** ISO 8601 week number (1 to 53) of a date. */
export function isoWeek(date: Date): number {
  const thursday = addDays(date, 3 - ((date.getUTCDay() + 6) % 7))
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const week1Monday = addDays(jan4, -((jan4.getUTCDay() + 6) % 7))

  return 1 + Math.round((thursday.getTime() - addDays(week1Monday, 3).getTime()) / (7 * DAY))
}

export type ChangeKind = 'up' | 'down' | 'flat' | 'new'

export type Change = {
  /** current minus previous. */
  abs: number
  /** Percent of the size of the previous figure; null when there is nothing to divide by. */
  pct: number | null
  /** "new" is a figure where there was nothing before: show the word, never Infinity. */
  kind: ChangeKind
}

const cents = (value: number) => Math.round(value * 100)

export function changeBetween(current: number, previous: number): Change {
  const abs = (cents(current) - cents(previous)) / 100

  if (abs === 0) return { abs: 0, pct: current === 0 ? null : 0, kind: 'flat' }
  if (cents(previous) === 0) return { abs, pct: null, kind: 'new' }

  return {
    abs,
    pct: Math.round((abs / Math.abs(previous)) * 1000) / 10,
    kind: abs > 0 ? 'up' : 'down',
  }
}

export type Tone = 'good' | 'bad' | 'neutral'

/** Whether a move is good news depends on the figure: more expenses is not green. */
export function toneOf(kind: ChangeKind, good: 'up' | 'down' | 'neutral'): Tone {
  if (kind === 'flat' || good === 'neutral') return 'neutral'
  if (kind === 'new') return good === 'up' ? 'good' : 'bad'

  return (kind === 'up') === (good === 'up') ? 'good' : 'bad'
}
