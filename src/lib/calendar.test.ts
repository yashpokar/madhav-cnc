import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  bucketByDay,
  chipOverflow,
  fieldsFromSchedule,
  istDayKey,
  istInstant,
  isDayKey,
  monthGrid,
  monthRange,
  rangesOverlap,
  scheduleFromFields,
  spanOf,
  weekDays,
} from './calendar'

describe('day keys', () => {
  it('validates real calendar days', () => {
    expect(isDayKey('2026-11-15')).toBe(true)
    expect(isDayKey('2026-02-30')).toBe(false)
    expect(isDayKey('nope')).toBe(false)
    expect(isDayKey(null)).toBe(false)
  })

  it('buckets instants into India days, not UTC days', () => {
    // 20:00 UTC on the 14th is 01:30 on the 15th in India.
    expect(istDayKey(new Date('2026-11-14T20:00:00Z'))).toBe('2026-11-15')
    expect(istDayKey(new Date('2026-11-14T18:29:00Z'))).toBe('2026-11-14')
    expect(istInstant('2026-11-15', '09:30').toISOString()).toBe('2026-11-15T04:00:00.000Z')
  })

  it('adds days and months, clamping the day', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('grid', () => {
  it('starts weeks on Monday', () => {
    expect(weekDays('2026-11-15')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
  })

  it('pads a month with leading and trailing days', () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const weeks = monthGrid('2026-11-15')

    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks).toHaveLength(6)
    expect(weeks[0][0]).toEqual({ key: '2026-10-26', day: 26, inMonth: false })
    expect(weeks[0][6]).toEqual({ key: '2026-11-01', day: 1, inMonth: true })
    expect(weeks[5][0].key).toBe('2026-11-30')
    expect(weeks[5][6]).toEqual({ key: '2026-12-06', day: 6, inMonth: false })
  })

  it('uses only the weeks it needs', () => {
    // February 2027 starts on a Monday and has 28 days: exactly four weeks.
    expect(monthGrid('2027-02-10')).toHaveLength(4)
    expect(monthRange('2027-02-10')).toEqual({ from: '2027-02-01', to: '2027-03-01' })
  })
})

describe('placing entries', () => {
  it('prefers startsAt, falls back to the due date as all-day', () => {
    const timed = spanOf({
      startsAt: new Date('2026-11-14T20:00:00Z'),
      endsAt: null,
      dueDate: new Date('2026-11-30T00:00:00Z'),
    })

    expect(timed).toMatchObject({ startKey: '2026-11-15', endKey: '2026-11-15', allDay: false })

    const due = spanOf({ startsAt: null, endsAt: null, dueDate: new Date('2026-11-30T00:00:00Z') })

    expect(due).toMatchObject({ startKey: '2026-11-30', allDay: true })
    expect(spanOf({ startsAt: null, endsAt: null, dueDate: null })).toBeNull()
  })

  it('treats midnight India time as all-day', () => {
    expect(
      spanOf({ startsAt: istInstant('2026-11-20'), endsAt: null, dueDate: null })?.allDay,
    ).toBe(true)
  })

  it('spreads multi-day entries and orders all-day first, then by time', () => {
    const wedding = {
      id: 'wedding',
      startsAt: istInstant('2026-11-20', '18:00'),
      endsAt: istInstant('2026-11-22', '02:00'),
      dueDate: null,
    }
    const shoot = {
      id: 'shoot',
      startsAt: istInstant('2026-11-21', '08:00'),
      endsAt: null,
      dueDate: null,
    }
    const job = { id: 'job', startsAt: null, endsAt: null, dueDate: new Date('2026-11-21T00:00:00Z') }
    const buckets = bucketByDay([shoot, wedding, job])

    expect([...buckets.keys()].sort()).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    expect(buckets.get('2026-11-21')?.map((entry) => entry.id)).toEqual(['job', 'wedding', 'shoot'])
  })
})

describe('chip overflow', () => {
  it('shows up to three and counts the rest', () => {
    expect(chipOverflow([1, 2, 3, 4, 5])).toEqual({ visible: [1, 2, 3], more: 2 })
    expect(chipOverflow([1, 2])).toEqual({ visible: [1, 2], more: 0 })
  })
})

describe('overlap', () => {
  const at = (time: string, day = '2026-11-20') => istInstant(day, time)

  it('detects overlapping ranges', () => {
    expect(
      rangesOverlap({ start: at('10:00'), end: at('12:00') }, { start: at('11:00'), end: at('13:00') }),
    ).toBe(true)
  })

  it('does not clash when one ends as the next starts', () => {
    expect(
      rangesOverlap({ start: at('10:00'), end: at('12:00') }, { start: at('12:00'), end: at('14:00') }),
    ).toBe(false)
  })

  it('treats an open-ended booking as a point that still clashes at the same time', () => {
    expect(rangesOverlap({ start: at('10:00'), end: null }, { start: at('10:00'), end: null })).toBe(true)
    expect(rangesOverlap({ start: at('10:00'), end: null }, { start: at('10:30'), end: null })).toBe(false)
    expect(
      rangesOverlap({ start: at('10:00'), end: null }, { start: at('09:00'), end: at('11:00') }),
    ).toBe(true)
  })
})

describe('form fields', () => {
  it('round-trips and applies defaults for blank times', () => {
    expect(scheduleFromFields({ startDate: '' })).toEqual({ startsAt: null, endsAt: null })

    const whole = scheduleFromFields({ startDate: '2026-11-20', endDate: '2026-11-21' })

    expect(whole.startsAt?.toISOString()).toBe('2026-11-19T18:30:00.000Z')
    expect(whole.endsAt?.toISOString()).toBe('2026-11-21T18:29:00.000Z')
    expect(fieldsFromSchedule(whole.startsAt, whole.endsAt)).toEqual({
      startDate: '2026-11-20',
      startTime: '',
      endDate: '2026-11-21',
      endTime: '',
    })

    const timed = scheduleFromFields({ startDate: '2026-11-20', startTime: '10:00', endTime: '13:30' })

    expect(fieldsFromSchedule(timed.startsAt, timed.endsAt)).toEqual({
      startDate: '2026-11-20',
      startTime: '10:00',
      endDate: '2026-11-20',
      endTime: '13:30',
    })
  })
})
