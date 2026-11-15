import { describe, expect, it } from 'vitest'
import {
  channelAdjustmentTotal,
  channelClosingWithAdjustments,
  customerAdjustmentSplit,
  customerBalance,
  directionOf,
  isFarFuture,
  previewBalance,
  signedAmount,
  validateAdjustmentAmount,
} from '@/lib/adjustments-math'
import { bucketFor, channelClosing, daysOverdue } from '@/lib/receivables-math'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('signedAmount', () => {
  it('derives the sign from the direction, whatever sign was typed', () => {
    expect(signedAmount('up', 250)).toBe(250)
    expect(signedAmount('down', 250)).toBe(-250)
    expect(signedAmount('down', -250)).toBe(-250)
    expect(signedAmount('up', -250)).toBe(250)
    expect(signedAmount('down', 10.005)).toBe(-10.01)
    expect(directionOf(-1)).toBe('down')
    expect(directionOf(1)).toBe('up')
  })
})

describe('validateAdjustmentAmount', () => {
  it('rejects zero, non-numbers and huge amounts', () => {
    expect(validateAdjustmentAmount(0).ok).toBe(false)
    expect(validateAdjustmentAmount(0.001).ok).toBe(false)
    expect(validateAdjustmentAmount(Number.NaN).ok).toBe(false)
    expect(validateAdjustmentAmount(100_000_000).ok).toBe(false)
    expect(validateAdjustmentAmount(99_999_999).ok).toBe(true)
    expect(validateAdjustmentAmount(0.01).ok).toBe(true)
  })
})

describe('isFarFuture', () => {
  it('allows today and a little ahead, refuses far ahead', () => {
    const today = day('2026-11-15')

    expect(isFarFuture(day('2026-11-15'), today)).toBe(false)
    expect(isFarFuture(day('2026-12-15'), today)).toBe(false)
    expect(isFarFuture(day('2027-03-01'), today)).toBe(true)
    expect(isFarFuture(day('2020-01-01'), today)).toBe(false)
  })
})

describe('channel balance', () => {
  const rows = [
    { amount: 500, adjustedOn: day('2026-04-10') },
    { amount: -120.5, adjustedOn: day('2026-05-01') },
    { amount: 90, adjustedOn: day('2026-03-01') },
  ]

  it('counts only adjustments on or after the opening date', () => {
    expect(channelAdjustmentTotal(rows, day('2026-04-01'))).toBe(379.5)
    expect(channelAdjustmentTotal(rows, day('2026-04-10'))).toBe(379.5)
    expect(channelAdjustmentTotal(rows, day('2026-04-11'))).toBe(-120.5)
  })

  it('counts everything when there is no opening date', () => {
    expect(channelAdjustmentTotal(rows, null)).toBe(469.5)
  })

  it('adds the adjustments to the closing exactly once', () => {
    const base = channelClosing(1000, 300, 100)
    const adjusted = channelClosingWithAdjustments({
      opening: 1000,
      inflow: 300,
      outflow: 100,
      adjustments: 379.5,
    })

    expect(base).toBe(1200)
    expect(adjusted).toBe(1579.5)
    expect(adjusted - base).toBe(379.5)
  })

  it('can take a mode negative and previews the change', () => {
    expect(previewBalance(100, -250)).toBe(-150)
    expect(previewBalance(100, 250.25)).toBe(350.25)
  })
})

describe('customer adjustments', () => {
  it('nets before splitting: an increase is a debit, a decrease a credit', () => {
    const rows = [
      { amount: 500, adjustedOn: day('2026-06-01') },
      { amount: -200, adjustedOn: day('2026-07-01') },
    ]

    expect(customerAdjustmentSplit(rows)).toMatchObject({ net: 300, debit: 300, credit: 0 })
    expect(customerAdjustmentSplit([{ amount: -75, adjustedOn: day('2026-06-01') }])).toMatchObject({
      net: -75,
      debit: 0,
      credit: 75,
      agingFrom: null,
    })
    expect(customerAdjustmentSplit([])).toMatchObject({ net: 0, debit: 0, credit: 0 })
  })

  it('ages from the oldest increase', () => {
    const split = customerAdjustmentSplit([
      { amount: 100, adjustedOn: day('2026-08-01') },
      { amount: 50, adjustedOn: day('2026-05-01') },
      { amount: -10, adjustedOn: day('2026-01-01') },
    ])
    const days = daysOverdue(split.agingFrom as Date, day('2026-11-15'))

    expect(split.agingFrom).toEqual(day('2026-05-01'))
    expect(bucketFor(days)).toBe('b90plus')
  })

  it('folds an increase into due exactly once and keeps net consistent', () => {
    const without = customerBalance({
      invoiceDue: 1000,
      openingRemaining: 400,
      onAccount: 0,
      creditNotes: 0,
      adjustments: [],
    })
    const withIncrease = customerBalance({
      invoiceDue: 1000,
      openingRemaining: 400,
      onAccount: 0,
      creditNotes: 0,
      adjustments: [{ amount: 250, adjustedOn: day('2026-06-01') }],
    })

    expect(without.due).toBe(1400)
    expect(withIncrease.due).toBe(1650)
    expect(withIncrease.net - without.net).toBe(250)
    expect(withIncrease.credit).toBe(0)
  })

  it('shows a decrease as credit, so due never goes negative but net can', () => {
    const result = customerBalance({
      invoiceDue: 100,
      openingRemaining: 0,
      onAccount: 20,
      creditNotes: 30,
      adjustments: [{ amount: -300, adjustedOn: day('2026-06-01') }],
    })

    expect(result.due).toBe(100)
    expect(result.credit).toBe(330)
    expect(result.net).toBe(-250)
    // Same as the plain signed sum of every component.
    expect(result.net).toBe(100 + 0 - 20 - 30 + -300)
  })

  it('a receipt on account settles a positive adjustment through the net', () => {
    const result = customerBalance({
      invoiceDue: 0,
      openingRemaining: 0,
      onAccount: 500,
      creditNotes: 0,
      adjustments: [{ amount: 500, adjustedOn: day('2026-06-01') }],
    })

    expect(result.net).toBe(0)
  })
})
