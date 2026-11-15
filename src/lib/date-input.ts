/**
 * Pure helpers behind the date, time and month pickers. Everything here works
 * on plain strings ('yyyy-mm-dd', 'HH:mm', 'yyyy-mm') so values submit the same
 * way the browser's native inputs did, and nothing depends on the machine's
 * time zone.
 */

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const pad = (value: number) => String(value).padStart(2, '0')

export const monthShortNames = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1))

function validIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || year < 1000 || year > 9999) return null

  const probe = new Date(Date.UTC(year, month - 1, day))

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }

  return `${year}-${pad(month)}-${pad(day)}`
}

export function isIsoDate(value: string | null | undefined): value is string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')

  return Boolean(match && validIso(Number(match[1]), Number(match[2]), Number(match[3])))
}

/** Today's 'yyyy-mm-dd' on the user's own calendar. */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))

  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

function monthIndex(word: string): number {
  const key = word.toLowerCase()

  if (key.length < 3) return -1

  return MONTH_NAMES.findIndex((name) => name.toLowerCase().startsWith(key))
}

function fullYear(raw: string): number {
  const year = Number(raw)

  return raw.length <= 2 ? 2000 + year : year
}

/**
 * Reads what someone typed into a date field. Forgiving on purpose:
 * '15/11/2026', '15-11-26', '15.11.2026', '15112026', '5 dec 2026', 'Dec 5, 2026',
 * '2026-11-15', and the words today, tomorrow, yesterday. A missing year means
 * the current year. Returns 'yyyy-mm-dd' or null when it is not a real day.
 */
export function parseTypedDate(input: string, today: string = todayIso()): string | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ')

  if (!text) return null

  if (text === 'today' || text === 'now') return today
  if (text === 'tomorrow' || text === 'tmrw') return addDaysIso(today, 1)
  if (text === 'yesterday') return addDaysIso(today, -1)

  const thisYear = Number(today.slice(0, 4))

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text)

  if (match) return validIso(Number(match[1]), Number(match[2]), Number(match[3]))

  match = /^(\d{1,2})[-/.\s](\d{1,2})(?:[-/.\s](\d{2}|\d{4}))?$/.exec(text)

  if (match) {
    return validIso(match[3] ? fullYear(match[3]) : thisYear, Number(match[2]), Number(match[1]))
  }

  match = /^(\d{2})(\d{2})(\d{4})$/.exec(text)

  if (match) return validIso(Number(match[3]), Number(match[2]), Number(match[1]))

  // 5 dec 2026, 5th december, 5-dec-26
  match = /^(\d{1,2})(?:st|nd|rd|th)?[-/.\s]*([a-z]{3,9})\.?(?:,?[-/.\s]*(\d{2}|\d{4}))?$/.exec(text)

  if (match) {
    const month = monthIndex(match[2])

    if (month < 0) return null

    return validIso(match[3] ? fullYear(match[3]) : thisYear, month + 1, Number(match[1]))
  }

  // dec 5, 2026
  match = /^([a-z]{3,9})\.?[-/.\s]*(\d{1,2})(?:st|nd|rd|th)?(?:,?[-/.\s]*(\d{2}|\d{4}))?$/.exec(text)

  if (match) {
    const month = monthIndex(match[1])

    if (month < 0) return null

    return validIso(match[3] ? fullYear(match[3]) : thisYear, month + 1, Number(match[2]))
  }

  return null
}

/** Keeps an ISO date inside [min, max] (either may be missing). */
export function clampIso(iso: string, min?: string | null, max?: string | null): string {
  if (isIsoDate(min) && iso < min) return min
  if (isIsoDate(max) && iso > max) return max

  return iso
}

/** True when the date sits outside [min, max]. */
export function outOfRange(iso: string, min?: string | null, max?: string | null): boolean {
  return clampIso(iso, min, max) !== iso
}

/** '15 Nov 2026' from 'yyyy-mm-dd', or '' when it is not a date. */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!isIsoDate(iso)) return ''

  const [y, m, d] = iso.split('-').map(Number)

  return `${d} ${monthShortNames[m - 1]} ${y}`
}

/* ---- Time ---------------------------------------------------------------- */

function validTime(hours: number, minutes: number): string | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return `${pad(hours)}:${pad(minutes)}`
}

export function isTimeValue(value: string | null | undefined): value is string {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '')

  return Boolean(match && validTime(Number(match[1]), Number(match[2])))
}

/**
 * Reads a typed time: '3pm', '3:30 pm', '15:30', '0930', '930', '9', '12am'.
 * Returns 24-hour 'HH:mm' or null.
 */
export function parseTypedTime(input: string): string | null {
  const text = input.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '')

  if (!text) return null

  if (text === 'noon') return '12:00'
  if (text === 'midnight') return '00:00'

  const match = /^(\d{1,2})(?::?(\d{2}))?(a|p|am|pm)?$/.exec(text)

  if (!match) return null

  let hours = Number(match[1])
  const minutes = match[2] ? Number(match[2]) : 0
  const meridiem = match[3]

  if (meridiem) {
    if (hours < 1 || hours > 12) return null

    hours = (hours % 12) + (meridiem.startsWith('p') ? 12 : 0)
  }

  return validTime(hours, minutes)
}

/** '15:30' becomes '3:30 pm', matching how the rest of the app shows times. */
export function formatTime12(value: string | null | undefined): string {
  if (!isTimeValue(value)) return ''

  const [hours, minutes] = value.split(':').map(Number)
  const hour12 = hours % 12 === 0 ? 12 : hours % 12

  return `${hour12}:${pad(minutes)} ${hours < 12 ? 'am' : 'pm'}`
}

/** Every 'HH:mm' slot in a day, step minutes apart (default 15). */
export function timeSlots(step = 15): string[] {
  const slots: string[] = []

  for (let minute = 0; minute < 24 * 60; minute += step) {
    slots.push(`${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`)
  }

  return slots
}

/** The slot nearest to a time, for scrolling the list to the right place. */
export function nearestSlot(value: string, step = 15): string {
  if (!isTimeValue(value)) return '09:00'

  const [h, m] = value.split(':').map(Number)
  const rounded = Math.min(Math.round((h * 60 + m) / step) * step, 24 * 60 - step)

  return `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`
}

/* ---- Month --------------------------------------------------------------- */

export function isYearMonth(value: string | null | undefined): value is string {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '')

  return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12)
}

/** Moves 'yyyy-mm' by a number of months (negative goes back). */
export function stepMonth(value: string, months: number): string {
  const [y, m] = value.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1 + months, 1))

  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`
}

/** Moves the year of 'yyyy-mm', keeping the month. */
export function stepYear(value: string, years: number): string {
  return stepMonth(value, years * 12)
}

/** 'November 2026' from 'yyyy-mm'. */
export function formatYearMonth(value: string | null | undefined): string {
  if (!isYearMonth(value)) return ''

  const [y, m] = value.split('-').map(Number)

  return `${MONTH_NAMES[m - 1]} ${y}`
}

export function currentYearMonth(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}
