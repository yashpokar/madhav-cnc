import { describe, expect, it } from 'vitest'
import {
  autoApplyAmount,
  bucketFor,
  daysOverdue,
  channelClosing,
  invoiceDue,
  openingRemaining,
  planAutoApply,
  round2,
  uninvoicedDue,
  validateOpeningApplied,
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

describe('opening balance', () => {
  it('opening only', () => {
    expect(openingRemaining(5000, 0)).toBe(5000)
  })
  it('partly applied', () => {
    expect(openingRemaining(5000, 1500.5)).toBe(3499.5)
  })
  it('fully applied', () => {
    expect(openingRemaining(5000, 5000)).toBe(0)
  })
  it('never negative', () => {
    expect(openingRemaining(5000, 6000)).toBe(0)
    expect(openingRemaining(0, 0)).toBe(0)
  })
  it('total due adds invoice dues and what is left of the opening', () => {
    const invoices = invoiceDue({ ...base, allocated: 400 })
    expect(round2(invoices + openingRemaining(2000, 500))).toBe(2100)
  })

  const ok = { receipt: 1000, invoiceAllocated: 400, openingApplied: 600, openingLeft: 2000 }

  it('accepts a split that fits the receipt', () => {
    expect(validateOpeningApplied(ok)).toEqual({ ok: true })
  })
  it('rejects over-application against the receipt', () => {
    expect(validateOpeningApplied({ ...ok, openingApplied: 700 }).ok).toBe(false)
  })
  it('rejects more than the opening that remains', () => {
    expect(
      validateOpeningApplied({ ...ok, invoiceAllocated: 0, openingApplied: 900, openingLeft: 800 }).ok,
    ).toBe(false)
  })
  it('rejects a negative opening portion', () => {
    expect(validateOpeningApplied({ ...ok, openingApplied: -1 }).ok).toBe(false)
  })
})

describe('planAutoApply', () => {
  const none = { explicitInvoiceTotal: 0, explicitOpening: 0 }

  it('single open invoice, no opening: applies capped at due', () => {
    expect(
      planAutoApply({ ...none, receipt: 1500, openInvoiceDues: [1000], openingLeft: 0 }),
    ).toEqual({ invoiceIndex: 0, invoiceAmount: 1000, openingAmount: 0 })
  })
  it('opening only: applies capped at remaining opening', () => {
    expect(
      planAutoApply({ ...none, receipt: 3000, openInvoiceDues: [], openingLeft: 2000 }),
    ).toEqual({ invoiceIndex: null, invoiceAmount: 0, openingAmount: 2000 })
    expect(
      planAutoApply({ ...none, receipt: 500, openInvoiceDues: [], openingLeft: 2000 }).openingAmount,
    ).toBe(500)
  })
  it('does not steal money when the user chose opening', () => {
    expect(
      planAutoApply({
        receipt: 1000,
        explicitInvoiceTotal: 0,
        explicitOpening: 400,
        openInvoiceDues: [1000],
        openingLeft: 2000,
      }),
    ).toEqual({ invoiceIndex: null, invoiceAmount: 0, openingAmount: 0 })
  })
  it('one invoice plus an opening balance needs a choice', () => {
    expect(
      planAutoApply({ ...none, receipt: 1000, openInvoiceDues: [1000], openingLeft: 500 }).invoiceAmount,
    ).toBe(0)
  })
  it('several invoices need a choice', () => {
    expect(
      planAutoApply({ ...none, receipt: 1000, openInvoiceDues: [300, 400], openingLeft: 0 }).invoiceIndex,
    ).toBeNull()
  })
})

describe('channelClosing', () => {
  it('positive opening', () => {
    expect(channelClosing(10000, 5000, 2000)).toBe(13000)
  })
  it('negative opening (overdraft) stays signed', () => {
    expect(channelClosing(-4000, 1000, 500)).toBe(-3500)
    expect(channelClosing(-4000, 0, 0)).toBe(-4000)
  })
})
