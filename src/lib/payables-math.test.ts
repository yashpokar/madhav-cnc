import { describe, expect, it } from 'vitest'
import {
  advanceAmount,
  agePayables,
  allocateOldestFirst,
  billDue,
  openingPayableRemaining,
  overdueAmount,
  payableStatus,
  planVendorAutoApply,
  validateVendorPaymentSplit,
  withRunningBalance,
} from './payables-math'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('bill due and status', () => {
  it('is the total less payments applied', () => {
    expect(billDue(1000, 250.5)).toBe(749.5)
    expect(billDue(1000, 1000)).toBe(0)
  })

  it('reports paid, part paid, unpaid and overdue', () => {
    const base = { total: 1000, dueDate: '2026-12-01', today: '2026-11-15' }

    expect(payableStatus({ ...base, paid: 1000 })).toBe('PAID')
    expect(payableStatus({ ...base, paid: 100 })).toBe('PART_PAID')
    expect(payableStatus({ ...base, paid: 0 })).toBe('UNPAID')
    expect(payableStatus({ ...base, paid: 0, dueDate: '2026-11-01' })).toBe('OVERDUE')
  })
})

describe('opening payable', () => {
  it('is what is left after payments applied to it, never negative', () => {
    expect(openingPayableRemaining(5000, 1200)).toBe(3800)
    expect(openingPayableRemaining(5000, 6000)).toBe(0)
  })
})

describe('validateVendorPaymentSplit', () => {
  it('accepts a split within the payment and the opening left', () => {
    expect(
      validateVendorPaymentSplit({ payment: 1000, billAllocated: 600, openingApplied: 400, openingLeft: 400 }),
    ).toEqual({ ok: true })
  })

  it('rejects more than the payment', () => {
    expect(
      validateVendorPaymentSplit({ payment: 1000, billAllocated: 700, openingApplied: 400, openingLeft: 500 }).ok,
    ).toBe(false)
  })

  it('rejects more than the opening payable left', () => {
    expect(
      validateVendorPaymentSplit({ payment: 1000, billAllocated: 0, openingApplied: 600, openingLeft: 500 }).ok,
    ).toBe(false)
  })

  it('rejects negatives', () => {
    expect(
      validateVendorPaymentSplit({ payment: 1000, billAllocated: 0, openingApplied: -1, openingLeft: 500 }).ok,
    ).toBe(false)
  })
})

describe('planVendorAutoApply', () => {
  const base = { payment: 500, explicitBillTotal: 0, explicitOpening: 0 }
  const none = { billIndex: null, billAmount: 0, openingAmount: 0 }

  it('applies to the only open bill, capped at its due', () => {
    expect(planVendorAutoApply({ ...base, openBillDues: [300], openingLeft: 0 })).toEqual({
      billIndex: 0,
      billAmount: 300,
      openingAmount: 0,
    })
    expect(planVendorAutoApply({ ...base, openBillDues: [0, 900], openingLeft: 0 }).billAmount).toBe(500)
  })

  it('applies to the opening payable when there is no open bill', () => {
    expect(planVendorAutoApply({ ...base, openBillDues: [], openingLeft: 800 })).toEqual({
      billIndex: null,
      billAmount: 0,
      openingAmount: 500,
    })
  })

  it('leaves it unapplied when a choice is needed', () => {
    expect(planVendorAutoApply({ ...base, openBillDues: [100, 200], openingLeft: 0 })).toEqual(none)
    expect(planVendorAutoApply({ ...base, openBillDues: [100], openingLeft: 50 })).toEqual(none)
    expect(planVendorAutoApply({ ...base, openBillDues: [], openingLeft: 0 })).toEqual(none)
  })

  it('never overrides an explicit choice', () => {
    expect(planVendorAutoApply({ ...base, explicitBillTotal: 10, openBillDues: [300], openingLeft: 0 })).toEqual(none)
    expect(planVendorAutoApply({ ...base, explicitOpening: 10, openBillDues: [], openingLeft: 90 })).toEqual(none)
  })
})

describe('advance and oldest first', () => {
  it('shows the unapplied remainder as an advance', () => {
    expect(advanceAmount(1000, 600, 100)).toBe(300)
    expect(advanceAmount(1000, 900, 100)).toBe(0)
  })

  it('splits an amount over bills in order', () => {
    expect(allocateOldestFirst(700, [300, 300, 300])).toEqual([300, 300, 100])
    expect(allocateOldestFirst(100, [300, 300])).toEqual([100, 0])
  })
})

describe('aging', () => {
  const today = day('2026-11-15')
  const rows = [
    { due: 100, dueOn: day('2026-12-01') },
    { due: 200, dueOn: day('2026-11-05') },
    { due: 300, dueOn: day('2026-10-01') },
    { due: 400, dueOn: day('2026-07-01') },
    { due: 0, dueOn: day('2026-01-01') },
  ]

  it('puts open amounts in buckets and ignores settled ones', () => {
    const buckets = agePayables(rows, today)

    expect(buckets.map((b) => b.amount)).toEqual([100, 200, 300, 0, 400])
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(4)
  })

  it('counts only past-due amounts as overdue', () => {
    expect(overdueAmount(rows, today)).toBe(900)
  })
})

describe('withRunningBalance', () => {
  it('runs opening, bills and payments by date', () => {
    const rows = withRunningBalance([
      { kind: 'payment' as const, date: day('2026-11-03'), order: 1, debit: 0, credit: 700 },
      { kind: 'bill' as const, date: day('2026-11-01'), order: 1, debit: 500, credit: 0 },
      { kind: 'opening' as const, date: day('2026-10-01'), order: 0, debit: 1000, credit: 0 },
    ])

    expect(rows.map((r) => r.balance)).toEqual([1000, 1500, 800])
  })

  it('goes negative when the vendor holds an advance', () => {
    const rows = withRunningBalance([
      { kind: 'payment' as const, date: day('2026-11-03'), order: 1, debit: 0, credit: 300 },
    ])

    expect(rows[0].balance).toBe(-300)
  })
})
