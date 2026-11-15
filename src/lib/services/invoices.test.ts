import { describe, expect, it } from 'vitest'
import {
  buildPersistable,
  deleteBlock,
  editBlock,
  exceedsOutstanding,
  outstandingMessage,
  outstandingOf,
  statusChangeBlock,
} from '@/lib/invoice-rules'
import {
  invoiceInputSchema,
  paymentInputSchema,
  writeOffInputSchema,
} from '@/lib/validation/invoices'

const base = {
  customerId: 'c1',
  invoiceDate: '2026-01-05',
  lines: [
    { description: 'Board', unit: 'SQFT', quantity: 10, rate: 100, taxRatePercent: 18 },
  ],
}

describe('invoice totals', () => {
  it('splits GST as CGST+SGST within a state and IGST across states', () => {
    const intra = buildPersistable(invoiceInputSchema.parse(base))
    expect(intra.totals.subtotal).toBe(1000)
    expect(intra.totals.taxAmount).toBe(180)
    expect(intra.totals.cgstAmount).toBe(90)
    expect(intra.totals.igstAmount).toBe(0)
    expect(intra.totals.total).toBe(1180)
    expect(intra.lines[0].position).toBe(1)

    const inter = buildPersistable(
      invoiceInputSchema.parse({ ...base, isInterState: true }),
    )
    expect(inter.totals.igstAmount).toBe(180)
    expect(inter.totals.cgstAmount).toBe(0)
    expect(inter.lines[0].igstAmount).toBe(180)
  })

  it('applies a document discount to line tax proportionally', () => {
    const out = buildPersistable(
      invoiceInputSchema.parse({ ...base, discountType: 'PERCENT', discountValue: 10 }),
    )
    expect(out.totals.discountAmount).toBe(100)
    expect(out.totals.taxAmount).toBe(162)
    expect(out.lines[0].lineTotal).toBe(1162)
  })

  it('rejects an invoice with no lines', () => {
    expect(invoiceInputSchema.safeParse({ ...base, lines: [] }).success).toBe(false)
  })
})

describe('state rules', () => {
  it('only drafts are editable', () => {
    expect(editBlock('DRAFT')).toBeNull()
    expect(editBlock('ISSUED')).toMatch(/cannot be edited/)
    expect(editBlock('CANCELLED')).toMatch(/cannot be edited/)
  })

  it('blocks status changes that would orphan payments', () => {
    expect(statusChangeBlock('ISSUED', 'ISSUED', 0)).toBe('Already issued')
    expect(statusChangeBlock('ISSUED', 'DRAFT', 1)).toMatch(/cannot go back to draft/)
    expect(statusChangeBlock('ISSUED', 'CANCELLED', 2)).toMatch(/Remove the recorded payments/)
    expect(statusChangeBlock('ISSUED', 'CANCELLED', 0)).toBeNull()
    expect(statusChangeBlock('DRAFT', 'ISSUED', 0)).toBeNull()
  })

  it('blocks deleting with payments or notes', () => {
    expect(deleteBlock({ paymentAllocations: 1, creditDebitNotes: 0 })).toMatch(/Unapply/)
    expect(deleteBlock({ paymentAllocations: 0, creditDebitNotes: 1 })).toMatch(/Credit or debit/)
    expect(deleteBlock({ paymentAllocations: 0, creditDebitNotes: 0 })).toBeNull()
  })
})

describe('outstanding', () => {
  const due = outstandingOf({ total: 1000, advanceAdjusted: 100, paid: 300, writtenOff: 50 })

  it('subtracts advance, payments and write-offs', () => {
    expect(due).toBe(550)
    expect(outstandingMessage(550.456)).toBe('Only ₹550.46 is outstanding on this invoice')
  })

  it('allows half a paisa of slack only', () => {
    expect(exceedsOutstanding(550.004, due)).toBe(false)
    expect(exceedsOutstanding(550.01, due)).toBe(true)
  })
})

describe('payment and write-off input', () => {
  it('accepts JSON numbers and form strings alike', () => {
    const a = paymentInputSchema.parse({ amount: '10.5', channelId: 'x', paidOn: '2026-01-01' })
    const b = paymentInputSchema.parse({ amount: 10.5, channelId: 'x', paidOn: '2026-01-01' })
    expect(a.amount).toBe(b.amount)
    expect(
      paymentInputSchema.safeParse({ amount: 0, channelId: 'x', paidOn: '2026-01-01' }).success,
    ).toBe(false)
  })

  it('validates the write-off reason', () => {
    expect(
      writeOffInputSchema.safeParse({ amount: 5, reason: 'NOPE', writtenOffOn: '2026-01-01' })
        .success,
    ).toBe(false)
  })
})
