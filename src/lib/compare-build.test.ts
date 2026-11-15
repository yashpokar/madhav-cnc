import { describe, expect, it } from 'vitest'
import { buildCompare, fetchFrom } from '@/lib/compare-build'
import { dayKey } from '@/lib/compare-math'

const d = (text: string) => new Date(`${text}T00:00:00Z`)
const at = (date: string, value: number) => ({ date: d(date), value })

describe('buildCompare', () => {
  // Today is Wed 18 Nov 2026: three days into the week of Mon 16 Nov (elapsed 3).
  const today = d('2026-11-18')

  it('compares a week to date against the same days of the week before and a year ago', () => {
    const result = buildCompare('week', today, {
      sales: {
        rows: [
          at('2026-11-16', 100),
          at('2026-11-18', 50), // this week to date: 150
          at('2026-11-09', 40),
          at('2026-11-11', 20),
          at('2026-11-12', 500), // last week: Thursday is past the 3-day window
          at('2025-11-17', 60),
          at('2025-11-20', 900), // a year ago: only the Monday to Wednesday count
        ],
      },
    })
    const sales = result.metrics[0]

    expect(sales.current).toBe(150)
    expect(sales.previous).toBe(60)
    expect(sales.lastYear).toBe(60)
    expect(sales.vsPrevious).toEqual({ abs: 90, pct: 150, kind: 'up' })
    expect(result.previous.from).toBe('2026-11-09')
    expect(result.previous.to).toBe('2026-11-11')
    expect(result.lastYear.from).toBe('2025-11-17')
    expect(result.current.elapsedDays).toBe(3)
    expect(result.current.totalDays).toBe(7)
  })

  it('returns 12 periods oldest first, the last one partial, with a year-ago overlay', () => {
    const result = buildCompare('month', d('2026-11-15'), {
      orders: { rows: [at('2026-11-02', 1), at('2026-10-31', 1), at('2025-11-20', 1), at('2025-11-05', 1)] },
    })
    const { series } = result.metrics[0]

    expect(series).toHaveLength(12)
    expect(series[0].start).toBe('2025-12-01')
    expect(series[11]).toMatchObject({ start: '2026-11-01', value: 1, partial: true, label: 'Nov 26' })
    // Overlay for the partial month: only days 1 to 15 of Nov 2025.
    expect(series[11].lastYear).toBe(1)
    expect(series[10]).toMatchObject({ start: '2026-10-01', value: 1, partial: false })
  })

  it('handles year rollovers in the month series', () => {
    const result = buildCompare('month', d('2027-01-10'), {
      sales: { rows: [at('2026-12-05', 10), at('2027-01-01', 5)] },
    })
    const { series, previous, current } = result.metrics[0]

    expect(current).toBe(5)
    expect(previous).toBe(10)
    expect(series[10].start).toBe('2026-12-01')
    expect(series[0].start).toBe('2026-02-01')
  })

  it('reports "new" when the previous period had nothing', () => {
    const result = buildCompare('month', today, { sales: { rows: [at('2026-11-02', 10)] } })

    expect(result.metrics[0].vsPrevious).toEqual({ abs: 10, pct: null, kind: 'new' })
  })

  it('shows a brand new company as all zeros without errors', () => {
    const result = buildCompare('year', today, { sales: { rows: [] }, receivables: { rows: [] } })

    for (const metric of result.metrics) {
      expect(metric.current).toBe(0)
      expect(metric.vsPrevious.kind).toBe('flat')
      expect(metric.series.every((point) => point.value === 0)).toBe(true)
    }
  })

  it('treats receivables as a balance at the end of each slice, carrying the opening balance', () => {
    const result = buildCompare('month', d('2026-11-30'), {
      receivables: {
        opening: 1000,
        rows: [at('2026-09-10', 500), at('2026-10-05', -700), at('2026-11-20', 200)],
      },
    })
    const metric = result.metrics[0]

    expect(metric.current).toBe(1000) // 1000 + 500 - 700 + 200
    expect(metric.previous).toBe(800) // 1000 + 500 - 700
    expect(metric.series[9].value).toBe(1500) // end of Sep
  })

  it('does not let a balance go below zero', () => {
    const result = buildCompare('month', today, { receivables: { rows: [at('2026-11-02', -300)] } })

    expect(result.metrics[0].current).toBe(0)
  })

  it('only includes metrics it was given and derives net cash from its rows', () => {
    const result = buildCompare('month', today, {
      profit: { rows: [at('2026-11-02', 100), at('2026-11-03', -30)] },
    })

    expect(result.metrics.map((m) => m.key)).toEqual(['profit'])
    expect(result.metrics[0].current).toBe(70)
  })

  it('handles a leap-day previous month', () => {
    // March 2028 day 31 compared to all of leap February (29 days).
    const result = buildCompare('month', d('2028-03-31'), {
      sales: { rows: [at('2028-02-29', 7), at('2028-02-01', 3), at('2028-03-31', 1)] },
    })

    expect(result.metrics[0].previous).toBe(10)
    expect(result.previous.to).toBe('2028-02-29')
  })
})

describe('fetchFrom', () => {
  it('reaches a year behind the oldest trend period', () => {
    expect(dayKey(fetchFrom('month', d('2026-11-15')))).toBe('2024-12-01')
    expect(dayKey(fetchFrom('year', d('2026-11-15')))).toBe('2014-01-01')
    expect(dayKey(fetchFrom('week', d('2026-11-18')))).toBe('2025-09-01')
  })
})
