import { describe, expect, it } from 'vitest'
import {
  changeBetween,
  dayKey,
  daysBetween,
  isoWeek,
  lastYearStart,
  periodEnd,
  periodLabel,
  periodStart,
  shiftPeriod,
  toneOf,
  windowOf,
} from '@/lib/compare-math'

const d = (text: string) => new Date(`${text}T00:00:00Z`)
const k = (date: Date) => dayKey(date)

describe('periodStart', () => {
  it('starts weeks on Monday, including from a Sunday', () => {
    expect(k(periodStart('week', d('2026-11-15')))).toBe('2026-11-09') // Sunday
    expect(k(periodStart('week', d('2026-11-09')))).toBe('2026-11-09') // Monday
    expect(k(periodStart('week', d('2026-11-12')))).toBe('2026-11-09')
  })

  it('rolls a week back across a year boundary', () => {
    expect(k(periodStart('week', d('2027-01-01')))).toBe('2026-12-28')
    expect(k(periodStart('week', d('2021-01-03')))).toBe('2020-12-28')
  })

  it('finds the month and year start', () => {
    expect(k(periodStart('month', d('2026-02-28')))).toBe('2026-02-01')
    expect(k(periodStart('year', d('2026-12-31')))).toBe('2026-01-01')
  })
})

describe('shiftPeriod and periodEnd', () => {
  it('knows month lengths and the leap day', () => {
    expect(k(periodEnd('month', d('2026-02-01')))).toBe('2026-02-28')
    expect(k(periodEnd('month', d('2028-02-01')))).toBe('2028-02-29')
    expect(k(periodEnd('month', d('2026-04-01')))).toBe('2026-04-30')
    expect(k(periodEnd('month', d('2026-12-01')))).toBe('2026-12-31')
  })

  it('shifts months over year ends in both directions', () => {
    expect(k(shiftPeriod('month', d('2026-01-01'), -1))).toBe('2025-12-01')
    expect(k(shiftPeriod('month', d('2026-11-01'), 3))).toBe('2027-02-01')
    expect(k(shiftPeriod('month', d('2026-03-01'), -14))).toBe('2025-01-01')
  })

  it('shifts weeks and years', () => {
    expect(k(shiftPeriod('week', d('2026-11-09'), -11))).toBe('2026-08-24')
    expect(k(periodEnd('week', d('2026-12-28')))).toBe('2027-01-03')
    expect(k(shiftPeriod('year', d('2026-01-01'), -1))).toBe('2025-01-01')
    expect(k(periodEnd('year', d('2028-01-01')))).toBe('2028-12-31')
  })
})

describe('lastYearStart', () => {
  it('goes back 52 weeks for a week, staying on a Monday', () => {
    const last = lastYearStart('week', d('2026-11-09'))

    expect(k(last)).toBe('2025-11-10')
    expect(last.getUTCDay()).toBe(1)
  })

  it('goes back twelve months for a month', () => {
    expect(k(lastYearStart('month', d('2028-02-01')))).toBe('2027-02-01')
    expect(k(lastYearStart('month', d('2026-01-01')))).toBe('2025-01-01')
  })

  it('goes back one year for a year', () => {
    expect(k(lastYearStart('year', d('2026-01-01')))).toBe('2025-01-01')
  })
})

describe('windowOf', () => {
  it('matches the same number of days into an earlier month, clamped to its length', () => {
    // 30 days into March compared against February (28 days): all of February.
    expect(daysBetween(d('2026-03-01'), d('2026-03-30'))).toBe(30)
    expect(windowOf('month', d('2026-02-01'), 30)).toEqual({ from: d('2026-02-01'), to: d('2026-02-28') })
    expect(windowOf('month', d('2026-02-01'), 10)).toEqual({ from: d('2026-02-01'), to: d('2026-02-10') })
  })

  it('handles a leap February as the previous period', () => {
    expect(k(windowOf('month', d('2028-02-01'), 31).to)).toBe('2028-02-29')
  })
})

describe('isoWeek', () => {
  it('follows ISO 8601 around the new year', () => {
    expect(isoWeek(d('2026-01-01'))).toBe(1)
    expect(isoWeek(d('2021-01-01'))).toBe(53)
    expect(isoWeek(d('2020-12-31'))).toBe(53)
    expect(isoWeek(d('2024-12-30'))).toBe(1)
    expect(isoWeek(d('2026-11-15'))).toBe(46)
  })
})

describe('periodLabel', () => {
  it('labels each type compactly', () => {
    expect(periodLabel('week', d('2026-11-09'))).toBe('9 Nov')
    expect(periodLabel('month', d('2026-11-01'))).toBe('Nov 26')
    expect(periodLabel('year', d('2026-01-01'))).toBe('2026')
  })
})

describe('changeBetween', () => {
  it('computes percent and sign', () => {
    expect(changeBetween(150, 100)).toEqual({ abs: 50, pct: 50, kind: 'up' })
    expect(changeBetween(75, 100)).toEqual({ abs: -25, pct: -25, kind: 'down' })
  })

  it('says new, not infinity, when the previous figure is zero', () => {
    expect(changeBetween(40, 0)).toEqual({ abs: 40, pct: null, kind: 'new' })
  })

  it('is flat for nothing against nothing and for equal figures', () => {
    expect(changeBetween(0, 0).kind).toBe('flat')
    expect(changeBetween(12.5, 12.5)).toEqual({ abs: 0, pct: 0, kind: 'flat' })
  })

  it('drops to zero as -100%', () => {
    expect(changeBetween(0, 80)).toEqual({ abs: -80, pct: -100, kind: 'down' })
  })

  it('uses the size of a negative previous figure', () => {
    // From a loss of 100 to a profit of 50: up by 150, which is 150% of the 100 base.
    expect(changeBetween(50, -100)).toEqual({ abs: 150, pct: 150, kind: 'up' })
  })

  it('ignores floating point dust', () => {
    expect(changeBetween(0.3, 0.1 + 0.2).kind).toBe('flat')
  })
})

describe('toneOf', () => {
  it('makes more expenses bad and fewer good', () => {
    expect(toneOf('up', 'down')).toBe('bad')
    expect(toneOf('down', 'down')).toBe('good')
    expect(toneOf('up', 'up')).toBe('good')
    expect(toneOf('new', 'down')).toBe('bad')
  })

  it('keeps neutral metrics and flat moves colourless', () => {
    expect(toneOf('up', 'neutral')).toBe('neutral')
    expect(toneOf('flat', 'up')).toBe('neutral')
  })
})
