import { describe, expect, it } from 'vitest'
import {
  autoApplyAmount,
  bucketFor,
  daysOverdue,
  invoiceDue,
  uninvoicedDue,
} from './receivables-math'

const base = { total: 1000, advanceAdjusted: 0, allocated: 0, writtenOff: 0 }

describe('invoiceDue', () => {
  it('part-paid invoice', () => {
    expect(invoiceDue({ ...base, allocated: 400 })).toBe(600)
  })
  it('written-off invoice', () => {
    expect(invoiceDue({ ...base, allocated: 400, writtenOff: 600 })).toBe(0)
  })
  it('advance adjusted', () => {
    expect(invoiceDue({ ...base, advanceAdjusted: 250, allocated: 250 })).toBe(500)
  })
  it('rounds to 2 decimals', () => {
    expect(invoiceDue({ ...base, total: 0.3, allocated: 0.1 })).toBe(0.2)
  })
})

describe('daysOverdue and bucketFor', () => {
  const today = new Date('2026-11-15T10:00:00Z')
  const ago = (n: number) => new Date(Date.UTC(2026, 10, 15 - n))

  it('counts whole days', () => {
    expect(daysOverdue(ago(0), today)).toBe(0)
    expect(daysOverdue(ago(5), today)).toBe(5)
    expect(daysOverdue(ago(-3), today)).toBe(-3)
  })

  it.each([
    [0, 'notDue'],
    [1, 'b30'],
    [30, 'b30'],
    [31, 'b60'],
    [60, 'b60'],
    [61, 'b90'],
    [90, 'b90'],
    [91, 'b90plus'],
    [-5, 'notDue'],
  ])('%i days -> %s', (days, key) => {
    expect(bucketFor(days)).toBe(key)
  })
})

describe('autoApplyAmount', () => {
  it('applies the whole receipt when below the balance', () => {
    expect(autoApplyAmount(300, 600)).toBe(300)
  })
  it('caps at the invoice balance', () => {
    expect(autoApplyAmount(1000, 600)).toBe(600)
  })
  it('never negative', () => {
    expect(autoApplyAmount(500, -20)).toBe(0)
    expect(autoApplyAmount(-5, 100)).toBe(0)
  })
})

describe('uninvoicedDue', () => {
  it('subtracts the advance', () => {
    expect(uninvoicedDue(2925, 1000)).toBe(1925)
  })
  it('no advance owes the full total', () => {
    expect(uninvoicedDue(2925, 0)).toBe(2925)
  })
  it('never negative when over-advanced', () => {
    expect(uninvoicedDue(2925, 3000)).toBe(0)
  })
})
