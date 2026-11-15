import { describe, expect, it } from 'vitest'
import {
  clampIso,
  formatIsoDate,
  formatTime12,
  formatYearMonth,
  isIsoDate,
  nearestSlot,
  parseTypedDate,
  parseTypedTime,
  stepMonth,
  stepYear,
  timeSlots,
} from './date-input'

const TODAY = '2026-11-15'

describe('parseTypedDate', () => {
  it('reads day first numeric dates with any separator', () => {
    expect(parseTypedDate('15/11/2026', TODAY)).toBe('2026-11-15')
    expect(parseTypedDate('5-12-26', TODAY)).toBe('2026-12-05')
    expect(parseTypedDate('05.12.2026', TODAY)).toBe('2026-12-05')
    expect(parseTypedDate('05122026', TODAY)).toBe('2026-12-05')
  })

  it('reads month names', () => {
    expect(parseTypedDate('5 dec 2026', TODAY)).toBe('2026-12-05')
    expect(parseTypedDate('5th December', TODAY)).toBe('2026-12-05')
    expect(parseTypedDate('Dec 5, 2026', TODAY)).toBe('2026-12-05')
    expect(parseTypedDate('15 Nov 2026', TODAY)).toBe('2026-11-15')
  })

  it('uses the current year when none is typed', () => {
    expect(parseTypedDate('5/12', TODAY)).toBe('2026-12-05')
    expect(parseTypedDate('5 dec', TODAY)).toBe('2026-12-05')
  })

  it('reads ISO and the words today, tomorrow, yesterday', () => {
    expect(parseTypedDate('2026-02-28', TODAY)).toBe('2026-02-28')
    expect(parseTypedDate('today', TODAY)).toBe('2026-11-15')
    expect(parseTypedDate('Tomorrow', TODAY)).toBe('2026-11-16')
    expect(parseTypedDate('yesterday', '2026-03-01')).toBe('2026-02-28')
  })

  it('rejects things that are not real days', () => {
    expect(parseTypedDate('31/02/2026', TODAY)).toBeNull()
    expect(parseTypedDate('32 dec 2026', TODAY)).toBeNull()
    expect(parseTypedDate('hello', TODAY)).toBeNull()
    expect(parseTypedDate('', TODAY)).toBeNull()
    expect(parseTypedDate('5 foo 2026', TODAY)).toBeNull()
  })
})

describe('clampIso and formatting', () => {
  it('keeps a date inside min and max', () => {
    expect(clampIso('2026-01-01', '2026-02-01', '2026-03-01')).toBe('2026-02-01')
    expect(clampIso('2026-05-01', '2026-02-01', '2026-03-01')).toBe('2026-03-01')
    expect(clampIso('2026-02-15', '2026-02-01', '2026-03-01')).toBe('2026-02-15')
    expect(clampIso('2026-02-15')).toBe('2026-02-15')
  })

  it('shows a date as 15 Nov 2026 without time zone drift', () => {
    expect(formatIsoDate('2026-11-15')).toBe('15 Nov 2026')
    expect(formatIsoDate('2026-11-31')).toBe('')
    expect(isIsoDate('2026-02-30')).toBe(false)
  })
})

describe('time', () => {
  it('reads typed times into 24 hour HH:mm', () => {
    expect(parseTypedTime('3pm')).toBe('15:00')
    expect(parseTypedTime('3:30 PM')).toBe('15:30')
    expect(parseTypedTime('15:30')).toBe('15:30')
    expect(parseTypedTime('0930')).toBe('09:30')
    expect(parseTypedTime('930')).toBe('09:30')
    expect(parseTypedTime('9')).toBe('09:00')
    expect(parseTypedTime('12am')).toBe('00:00')
    expect(parseTypedTime('12pm')).toBe('12:00')
    expect(parseTypedTime('noon')).toBe('12:00')
  })

  it('rejects impossible times', () => {
    expect(parseTypedTime('25:00')).toBeNull()
    expect(parseTypedTime('13pm')).toBeNull()
    expect(parseTypedTime('10:75')).toBeNull()
    expect(parseTypedTime('soon')).toBeNull()
  })

  it('shows 12 hour labels and builds 15 minute slots', () => {
    expect(formatTime12('15:30')).toBe('3:30 pm')
    expect(formatTime12('00:00')).toBe('12:00 am')
    expect(formatTime12('12:05')).toBe('12:05 pm')
    expect(timeSlots()).toHaveLength(96)
    expect(timeSlots()[1]).toBe('00:15')
    expect(nearestSlot('09:07')).toBe('09:00')
    expect(nearestSlot('09:08')).toBe('09:15')
  })
})

describe('month stepping', () => {
  it('steps across year boundaries', () => {
    expect(stepMonth('2026-12', 1)).toBe('2027-01')
    expect(stepMonth('2026-01', -1)).toBe('2025-12')
    expect(stepYear('2026-11', 1)).toBe('2027-11')
    expect(formatYearMonth('2026-11')).toBe('November 2026')
  })
})
