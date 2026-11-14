/**
 * One place for how money and dates look, so the same amount or day reads the
 * same on every screen.
 *
 * Money: `money` always shows paise (₹7,080.00) and is the default for
 * anything that is added up or reconciled; `moneyWhole` (₹7,080) is for
 * summary tiles and lists where paise are noise.
 *
 * Dates: date-only values (invoice date, due date) are stored as UTC
 * midnight, so they are formatted in UTC and never shift a day. Timestamps
 * (when something was created or changed) are shown in India time.
 */
export const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

export const moneyWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** 14 Nov 2026 */
export const date = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** 14 Nov */
export const dateShort = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** 14 Nov 2026, 06:41 pm (India time) */
export const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
})

/** 14 Nov, 06:41 pm (India time) */
export const dateTimeShort = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
})
