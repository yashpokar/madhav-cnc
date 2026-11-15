/**
 * Pure date maths for the booking calendar.
 *
 * Days are 'YYYY-MM-DD' keys in India time (Asia/Kolkata, a fixed +05:30
 * offset with no daylight saving). Scheduled instants (Order.startsAt/endsAt)
 * are real timestamps and are bucketed into those days; date-only values
 * (Order.dueDate) are stored as UTC midnight and keep their own calendar day,
 * the same way src/lib/format.ts shows them.
 *
 * Convention: a start time of exactly 00:00 India time means "no time given"
 * and is shown as an all-day entry.
 */

const IST_OFFSET_MS = 330 * 60_000
const DAY_MS = 86_400_000

export const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export function isDayKey(value: string | null | undefined): value is string {
  if (!value || !DAY_KEY.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** The India calendar day of an instant. */
export function istDayKey(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 'HH:mm' of an instant in India time. */
export function istTime(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16)
}

/** The instant for a day key and 'HH:mm' (default midnight) in India time. */
export function istInstant(dayKey: string, time = '00:00'): Date {
  return new Date(new Date(`${dayKey}T${time}:00Z`).getTime() - IST_OFFSET_MS)
}

/** The day key of a date-only value (stored as UTC midnight). */
export function dateOnlyKey(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function addDays(dayKey: string, days: number): string {
  return new Date(new Date(`${dayKey}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/** Same day-of-month where possible, clamped to the target month's length. */
export function addMonths(dayKey: string, months: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()

  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)),
  )
    .toISOString()
    .slice(0, 10)
}

/** 0 = Monday ... 6 = Sunday. */
function mondayIndex(dayKey: string): number {
  return (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7
}

export function startOfWeek(dayKey: string): string {
  return addDays(dayKey, -mondayIndex(dayKey))
}

export function weekDays(dayKey: string): string[] {
  const start = startOfWeek(dayKey)

  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export type GridDay = { key: string; day: number; inMonth: boolean }

/**
 * The weeks (Monday first) that cover a month, including the leading and
 * trailing days of the neighbouring months so every row has seven cells.
 */
export function monthGrid(dayKey: string): GridDay[][] {
  const monthPrefix = dayKey.slice(0, 7)
  const first = `${monthPrefix}-01`
  const last = addDays(addMonths(first, 1), -1)
  const start = startOfWeek(first)
  const end = addDays(startOfWeek(last), 6)
  const weeks: GridDay[][] = []

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
    weeks.push(
      weekDays(cursor).map((key) => ({
        key,
        day: Number(key.slice(8)),
        inMonth: key.startsWith(monthPrefix),
      })),
    )
  }

  return weeks
}

/** First day shown and the day after the last one shown, for a month grid. */
export function monthRange(dayKey: string): { from: string; to: string } {
  const weeks = monthGrid(dayKey)

  return { from: weeks[0][0].key, to: addDays(weeks[weeks.length - 1][6].key, 1) }
}

export type CalendarSource = {
  startsAt: Date | null
  endsAt: Date | null
  dueDate: Date | null
}

export type Span = {
  /** First and last India day the entry touches. */
  startKey: string
  endKey: string
  allDay: boolean
  /** Sort position within a day: all-day first, then by start time. */
  sortMs: number
}

/** Where an entry sits on the calendar, or null when it has no date at all. */
export function spanOf(source: CalendarSource): Span | null {
  if (source.startsAt) {
    const startKey = istDayKey(source.startsAt)
    const endKey =
      source.endsAt && source.endsAt >= source.startsAt
        ? istDayKey(source.endsAt)
        : startKey

    return {
      startKey,
      endKey,
      allDay: istTime(source.startsAt) === '00:00',
      sortMs: source.startsAt.getTime(),
    }
  }

  if (source.dueDate) {
    const key = dateOnlyKey(source.dueDate)

    return { startKey: key, endKey: key, allDay: true, sortMs: istInstant(key).getTime() }
  }

  return null
}

/** The most days one entry is spread over, so a typo'd end date cannot flood the grid. */
const MAX_SPAN_DAYS = 31

/**
 * Groups entries by the India days they fall on (multi-day entries appear on
 * each day), ordered within a day by all-day first and then start time.
 */
export function bucketByDay<T extends CalendarSource>(
  entries: readonly T[],
): Map<string, T[]> {
  const buckets = new Map<string, { entry: T; span: Span }[]>()

  for (const entry of entries) {
    const span = spanOf(entry)

    if (!span) continue

    let key = span.startKey

    for (let i = 0; i < MAX_SPAN_DAYS && key <= span.endKey; i++) {
      const list = buckets.get(key) ?? []

      list.push({ entry, span })
      buckets.set(key, list)
      key = addDays(key, 1)
    }
  }

  const result = new Map<string, T[]>()

  for (const [key, list] of buckets) {
    list.sort(
      (a, b) =>
        Number(b.span.allDay) - Number(a.span.allDay) || a.span.sortMs - b.span.sortMs,
    )
    result.set(
      key,
      list.map((item) => item.entry),
    )
  }

  return result
}

/** The chips to draw in a day cell and how many were left out. */
export function chipOverflow<T>(items: readonly T[], max = 3) {
  return {
    visible: items.slice(0, max),
    more: Math.max(items.length - max, 0),
  }
}

const MINUTE_MS = 60_000

/**
 * Two time ranges clash when they overlap; touching ends (one finishes as
 * the next starts) do not. A range with no end counts as one minute so two
 * bookings at exactly the same time still clash.
 */
export function rangesOverlap(
  a: { start: Date; end: Date | null },
  b: { start: Date; end: Date | null },
): boolean {
  const aEnd = Math.max((a.end ?? a.start).getTime(), a.start.getTime() + MINUTE_MS)
  const bEnd = Math.max((b.end ?? b.start).getTime(), b.start.getTime() + MINUTE_MS)

  return a.start.getTime() < bEnd && b.start.getTime() < aEnd
}

/**
 * Turns the form's four fields into instants. A blank start time means the
 * whole day (00:00); a blank end time means the end of that day (23:59). An
 * end time with no end date stays on the start day.
 */
export function scheduleFromFields(fields: {
  startDate?: string | null
  startTime?: string | null
  endDate?: string | null
  endTime?: string | null
}): { startsAt: Date | null; endsAt: Date | null } {
  if (!fields.startDate) return { startsAt: null, endsAt: null }

  const startsAt = istInstant(fields.startDate, fields.startTime || '00:00')

  if (!fields.endDate && !fields.endTime) return { startsAt, endsAt: null }

  const endsAt = istInstant(
    fields.endDate || fields.startDate,
    fields.endTime || '23:59',
  )

  return { startsAt, endsAt }
}

/** Splits instants back into the form's fields (India time). */
export function fieldsFromSchedule(startsAt: Date | null, endsAt: Date | null) {
  return {
    startDate: startsAt ? istDayKey(startsAt) : '',
    startTime: startsAt && istTime(startsAt) !== '00:00' ? istTime(startsAt) : '',
    endDate: endsAt ? istDayKey(endsAt) : '',
    endTime: endsAt && istTime(endsAt) !== '23:59' ? istTime(endsAt) : '',
  }
}

const dayLabel = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

const timeLabel = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})

/** "Sat, 20 Nov 2026, 6:00 pm to Sun, 21 Nov 2026, 2:00 am" (India time); the time is left out for all-day. */
export function describeSchedule(startsAt: Date, endsAt: Date | null): string {
  const allDay = istTime(startsAt) === '00:00'
  const start = allDay
    ? dayLabel.format(startsAt)
    : `${dayLabel.format(startsAt)}, ${timeLabel.format(startsAt)}`

  if (!endsAt || endsAt < startsAt) return start

  const sameDay = istDayKey(startsAt) === istDayKey(endsAt)
  const endAllDay = istTime(endsAt) === '23:59'

  if (sameDay && allDay) return start

  if (sameDay) return `${start} to ${timeLabel.format(endsAt)}`

  return `${start} to ${endAllDay ? dayLabel.format(endsAt) : `${dayLabel.format(endsAt)}, ${timeLabel.format(endsAt)}`}`
}

/** Just the time range of an entry on its day, or null when it is all-day. */
export function describeTime(startsAt: Date, endsAt: Date | null): string | null {
  if (istTime(startsAt) === '00:00') return null

  const start = timeLabel.format(startsAt)

  return endsAt && endsAt > startsAt && istDayKey(endsAt) === istDayKey(startsAt)
    ? `${start} to ${timeLabel.format(endsAt)}`
    : start
}
