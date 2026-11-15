import { describe, expect, it } from 'vitest'
import { documentTotals, lineTotals } from '@/lib/pricing'
import {
  billTotals,
  canEditBill,
  canMoveBill,
  canMoveOrder,
  defaultDueDate,
  orderMessage,
  paymentStatus,
  suggestInterState,
} from '@/lib/purchase-rules'

describe('billTotals', () => {
  const lines = [
    { qty: 10, rate: 100, discount: 50, taxRatePercent: 18 },
    { qty: 3, rate: 250.5, discount: 0, taxRatePercent: 5 },
  ]

  it('matches the invoice helper for the same lines', () => {
    const { totals } = billTotals(lines, false)
    const invoice = documentTotals({
      lines: [
        { quantity: 10, rate: 100, discountPercent: 5, taxRatePercent: 18 },
        { quantity: 3, rate: 250.5, discountPercent: 0, taxRatePercent: 5 },
      ],
      discountType: 'NONE',
      discountValue: 0,
    })

    expect(totals.taxableAmount).toBe(invoice.taxableAmount)
    expect(totals.taxAmount).toBe(invoice.taxAmount)
    expect(totals.total).toBe(invoice.total)
    expect(totals.roundOff).toBe(invoice.roundOff)
  })

  it('splits tax into CGST and SGST, or IGST when inter-state', () => {
    const intra = billTotals(lines, false).totals
    const inter = billTotals(lines, true).totals

    expect(intra.igst).toBe(0)
    expect(intra.cgst + intra.sgst).toBeCloseTo(intra.taxAmount, 2)
    expect(inter.cgst).toBe(0)
    expect(inter.sgst).toBe(0)
    expect(inter.igst).toBe(inter.taxAmount)
  })

  it('reports gross subtotal, discount and per-line totals', () => {
    const { totals, lines: computed } = billTotals(lines, false)

    expect(totals.subtotal).toBe(1751.5)
    expect(totals.discount).toBe(50)
    expect(computed[0]).toEqual({
      discount: 50,
      taxable: 950,
      taxAmount: 171,
      lineTotal: 1121,
    })
    expect(computed[1].lineTotal).toBe(lineTotals({ quantity: 3, rate: 250.5, discountPercent: 0, taxRatePercent: 5 }).lineTotal)
  })

  it('never lets a discount exceed the line', () => {
    const { lines: computed } = billTotals(
      [{ qty: 1, rate: 100, discount: 500, taxRatePercent: 18 }],
      false,
    )

    expect(computed[0].taxable).toBe(0)
    expect(computed[0].lineTotal).toBe(0)
  })

  it('rounds the total to a whole rupee and keeps the round-off', () => {
    const { totals } = billTotals(
      [{ qty: 1, rate: 99.99, discount: 0, taxRatePercent: 0 }],
      false,
    )

    expect(totals.total).toBe(100)
    expect(totals.roundOff).toBe(0.01)
  })
})

describe('paymentStatus', () => {
  const base = { total: 1000, today: '2026-11-15' }

  it('is unpaid with nothing applied and the due date ahead', () => {
    expect(paymentStatus({ ...base, paid: 0, dueDate: '2026-12-01' })).toBe('UNPAID')
  })

  it('is part paid when some is applied and not yet due', () => {
    expect(paymentStatus({ ...base, paid: 400, dueDate: '2026-12-01' })).toBe('PART_PAID')
  })

  it('is paid when nothing is left, even past the due date', () => {
    expect(paymentStatus({ ...base, paid: 1000, dueDate: '2026-01-01' })).toBe('PAID')
  })

  it('is overdue once past due with a balance, paid in part or not', () => {
    expect(paymentStatus({ ...base, paid: 0, dueDate: '2026-11-01' })).toBe('OVERDUE')
    expect(paymentStatus({ ...base, paid: 300, dueDate: '2026-11-01' })).toBe('OVERDUE')
  })

  it('is not overdue on the due date itself, or without a due date', () => {
    expect(paymentStatus({ ...base, paid: 0, dueDate: '2026-11-15' })).toBe('UNPAID')
    expect(paymentStatus({ ...base, paid: 0, dueDate: null })).toBe('UNPAID')
  })
})

describe('bill transitions', () => {
  it('posts a draft and cancels a posted bill', () => {
    expect(canMoveBill('DRAFT', 'POSTED', 0).ok).toBe(true)
    expect(canMoveBill('POSTED', 'CANCELLED', 0).ok).toBe(true)
    expect(canMoveBill('POSTED', 'DRAFT', 0).ok).toBe(true)
  })

  it('blocks going back or cancelling while payments are applied', () => {
    expect(canMoveBill('POSTED', 'DRAFT', 1).ok).toBe(false)
    expect(canMoveBill('POSTED', 'CANCELLED', 2).ok).toBe(false)
  })

  it('treats cancelled as final and posting twice as a no-op error', () => {
    expect(canMoveBill('CANCELLED', 'DRAFT', 0).ok).toBe(false)
    expect(canMoveBill('POSTED', 'POSTED', 0).ok).toBe(false)
  })

  it('only drafts are editable', () => {
    expect(canEditBill('DRAFT')).toBe(true)
    expect(canEditBill('POSTED')).toBe(false)
  })
})

describe('order transitions', () => {
  it('moves by hand between draft, sent and cancelled', () => {
    expect(canMoveOrder('DRAFT', 'SENT').ok).toBe(true)
    expect(canMoveOrder('SENT', 'CANCELLED').ok).toBe(true)
  })

  it('leaves partial and received to goods receipts', () => {
    expect(canMoveOrder('SENT', 'PARTIAL').ok).toBe(false)
    expect(canMoveOrder('SENT', 'RECEIVED').ok).toBe(false)
    expect(canMoveOrder('PARTIAL', 'CANCELLED').ok).toBe(false)
  })
})

describe('defaultDueDate', () => {
  it('adds the payment terms in days', () => {
    expect(defaultDueDate('2026-11-15', 15)).toBe('2026-11-30')
  })

  it('falls back to 30 days without terms', () => {
    expect(defaultDueDate('2026-11-15', null)).toBe('2026-12-15')
    expect(defaultDueDate('2026-11-15', undefined)).toBe('2026-12-15')
  })

  it('honours zero days as due on the bill date', () => {
    expect(defaultDueDate('2026-11-15', 0)).toBe('2026-11-15')
  })
})

describe('suggestInterState', () => {
  it('compares the state codes of the two GSTINs', () => {
    expect(suggestInterState('24ABCDE1234F1Z5', '27ABCDE1234F1Z5')).toBe(true)
    expect(suggestInterState('24ABCDE1234F1Z5', '24XYZDE1234F1Z5')).toBe(false)
  })

  it('stays intra-state when either GSTIN is missing', () => {
    expect(suggestInterState(null, '27ABCDE1234F1Z5')).toBe(false)
    expect(suggestInterState('24ABCDE1234F1Z5', '')).toBe(false)
  })
})

describe('orderMessage', () => {
  it('lists the lines and total in plain text', () => {
    const text = orderMessage({
      company: 'Acme',
      vendor: 'Shree Traders',
      number: 'PO-0001',
      orderDate: '15 Nov 2026',
      expectedDate: null,
      lines: [{ description: 'Plywood 18mm', qty: 10, unit: 'sheet', rate: 1250 }],
      total: 14750,
      notes: null,
    })

    expect(text).toContain('Purchase order PO-0001 from Acme')
    expect(text).toContain('1. Plywood 18mm - 10 sheet @ Rs 1,250')
    expect(text).toContain('Rs 14,750')
  })
})
