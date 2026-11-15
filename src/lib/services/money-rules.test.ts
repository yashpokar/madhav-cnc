import { describe, expect, it, vi } from 'vitest'

// The services import the database client at module load; the rules under
// test here are pure, so a stub keeps this a unit test.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/active-company', () => ({ getActiveCompanyId: vi.fn(), requireCompanyId: vi.fn() }))
vi.mock('@/lib/codes', () => ({}))

const payments = await import('@/lib/services/payments')
const expenses = await import('@/lib/services/expenses')
const methods = await import('@/lib/services/payment-methods')
const adjustments = await import('@/lib/services/adjustments')

describe('checkAllocationRows', () => {
  const open = [
    { id: 'a', number: 'INV-1', due: 100 },
    { id: 'b', number: 'INV-2', due: 50 },
  ]

  it('drops zero rows and accepts a fitting split', () => {
    const result = payments.checkAllocationRows(
      150,
      [
        { invoiceId: 'a', amount: 100 },
        { invoiceId: 'b', amount: 0 },
      ],
      open,
    )

    expect(result).toEqual({ ok: true, rows: [{ invoiceId: 'a', amount: 100 }] })
  })

  it('refuses to apply more than the receipt', () => {
    const result = payments.checkAllocationRows(
      120,
      [
        { invoiceId: 'a', amount: 100 },
        { invoiceId: 'b', amount: 50 },
      ],
      open,
    )

    expect(result.ok).toBe(false)
  })

  it('refuses an invoice that is not open, or over its due', () => {
    expect(payments.checkAllocationRows(10, [{ invoiceId: 'zz', amount: 10 }], open)).toEqual({
      ok: false,
      error: 'One of the invoices is no longer open for this customer',
    })
    expect(payments.checkAllocationRows(500, [{ invoiceId: 'b', amount: 60 }], open)).toEqual({
      ok: false,
      error: 'INV-2 only has ₹50 outstanding',
    })
  })

  it('accepts an empty allocation without looking at invoices', () => {
    expect(payments.checkAllocationRows(10, [], [])).toEqual({ ok: true, rows: [] })
  })
})

describe('expenseAmounts', () => {
  it('adds GST to the amount', () => {
    expect(expenses.expenseAmounts({ amount: 1000, taxRatePercent: 18 })).toEqual({
      taxAmount: 180,
      total: 1180,
    })
  })

  it('rounds to paise', () => {
    expect(expenses.expenseAmounts({ amount: 99.99, taxRatePercent: 5 })).toEqual({
      taxAmount: 5,
      total: 104.99,
    })
  })

  it('has no tax at 0%', () => {
    expect(expenses.expenseAmounts({ amount: 250, taxRatePercent: 0 })).toEqual({
      taxAmount: 0,
      total: 250,
    })
  })
})

describe('payment method rules', () => {
  it('only a legacy bank transfer may stay a bank transfer', () => {
    expect(methods.bankTransferAllowed('BANK_TRANSFER', null)).toBe(false)
    expect(methods.bankTransferAllowed('BANK_TRANSFER', 'CASH')).toBe(false)
    expect(methods.bankTransferAllowed('BANK_TRANSFER', 'BANK_TRANSFER')).toBe(true)
    expect(methods.bankTransferAllowed('NEFT', null)).toBe(true)
  })

  it('moves a mode one place and stops at the edges', () => {
    expect(methods.reorder(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(methods.reorder(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b'])
    expect(methods.reorder(['a', 'b', 'c'], 'a', 'up')).toBeNull()
    expect(methods.reorder(['a', 'b', 'c'], 'c', 'down')).toBeNull()
    expect(methods.reorder(['a', 'b', 'c'], 'x', 'down')).toBeNull()
  })
})

describe('parseAdjustment', () => {
  const base = {
    kind: 'CUSTOMER' as const,
    targetId: 'c1',
    direction: 'down' as const,
    amount: 250,
    adjustedOn: '2026-04-01',
    reason: 'OTHER' as const,
    note: 'Round-off written off',
  }

  it('signs the amount by direction', () => {
    const down = adjustments.parseAdjustment(base)
    const up = adjustments.parseAdjustment({ ...base, direction: 'up' })

    expect(down.ok && down.amount).toBe(-250)
    expect(up.ok && up.amount).toBe(250)
  })

  it('rejects a missing note and a far-future date', () => {
    expect(adjustments.parseAdjustment({ ...base, note: 'x' }).ok).toBe(false)
    expect(
      adjustments.parseAdjustment({ ...base, adjustedOn: '2099-01-01' }, new Date('2026-04-01')),
    ).toEqual({ ok: false, error: 'Choose a date that is not far in the future' })
  })

  it('describes both kinds of adjustment', () => {
    expect(adjustments.describeAdjustment('CHANNEL', 100, 'Cash')).toMatch(/^added .*100.* to Cash$/)
    expect(adjustments.describeAdjustment('CUSTOMER', -100, 'Asha')).toMatch(
      /^lowered what Asha owes by .*100/,
    )
  })
})

describe('planOpeningChanges', () => {
  const names = new Map([['c1', 'Cash'], ['b1', 'HDFC']])

  it('plans set, negative and cleared entries', () => {
    const plan = adjustments.planOpeningChanges(
      [
        { channelId: 'c1', amount: '1000.456', asOf: '2026-04-01' },
        { channelId: 'b1', amount: '-50', asOf: '2026-04-01' },
        { channelId: 'c1', amount: '', asOf: '' },
      ],
      names,
    )

    expect(plan.ok && plan.changes.map((c) => c.amount)).toEqual([1000.46, -50, null])
  })

  it('reports an unknown mode, a bad amount and a missing date', () => {
    expect(adjustments.planOpeningChanges([{ channelId: 'x', amount: '1', asOf: '2026-04-01' }], names)).toEqual({
      ok: false,
      error: 'One of the payment modes no longer exists',
    })
    expect(adjustments.planOpeningChanges([{ channelId: 'c1', amount: 'abc', asOf: '2026-04-01' }], names).ok).toBe(false)
    expect(adjustments.planOpeningChanges([{ channelId: 'c1', amount: '5', asOf: '' }], names)).toEqual({
      ok: false,
      error: 'Cash: choose the date this balance is as of',
    })
  })
})
