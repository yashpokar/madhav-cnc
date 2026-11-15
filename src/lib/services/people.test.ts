import { describe, expect, it, vi } from 'vitest'

// The services import prisma; the rules under test are pure.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/codes', () => ({}))

import { linkedSummary, partnerTypeError } from '@/lib/services/customers'
import { itemUsageError, stockFields } from '@/lib/services/items'
import {
  materialNameSchema,
  nextSortOrder,
  reorderLevelError,
  swapTarget,
} from '@/lib/services/materials'
import { partnerReferenceError } from '@/lib/services/partners'
import { vendorDetail } from '@/lib/services/vendors'
import { customerInputSchema } from '@/lib/validation/customers'
import { itemInputSchema } from '@/lib/validation/items'
import { vendorInputSchema } from '@/lib/validation/vendors'

describe('customer rules', () => {
  const types = new Map([
    ['a1', 'ARCHITECT'],
    ['c1', 'CARPENTER'],
  ])

  it('accepts matching partner types and none at all', () => {
    expect(partnerTypeError('a1', 'c1', types)).toBeNull()
    expect(partnerTypeError(null, null, types)).toBeNull()
  })

  it('rejects swapped or unknown partners', () => {
    expect(partnerTypeError('c1', null, types)).toBe('Preferred architect must be an architect')
    expect(partnerTypeError(null, 'a1', types)).toBe('Preferred carpenter must be a carpenter')
    expect(partnerTypeError('zzz', null, types)).toBe('Preferred architect must be an architect')
  })

  it('lists linked documents with plurals', () => {
    expect(linkedSummary([[0, 'order'], [1, 'invoice'], [2, 'note']])).toEqual([
      '1 invoice',
      '2 notes',
    ])
    expect(linkedSummary([[0, 'order']])).toEqual([])
  })

  it('validates JSON input the same way as form input', () => {
    const ok = customerInputSchema.safeParse({ name: ' Asha ', phone: '9876543210', paymentTermsDays: 30 })
    expect(ok.success && ok.data.name).toBe('Asha')
    expect(ok.success && ok.data.paymentTermsDays).toBe(30)
    expect(customerInputSchema.safeParse({ name: 'x', phone: '1' }).success).toBe(false)
  })
})

describe('item rules', () => {
  it('never stocks a service', () => {
    const data = { supplyType: 'SERVICE', stockTracked: true, reorderLevel: 5 }
    expect(stockFields(data)).toEqual({ supplyType: 'SERVICE', stockTracked: false, reorderLevel: null })
    const goods = { supplyType: 'GOODS', stockTracked: true, reorderLevel: 5 }
    expect(stockFields(goods)).toBe(goods)
  })

  it('refuses deletion only when lines use the item', () => {
    expect(itemUsageError('Ply', 0)).toBeNull()
    expect(itemUsageError('Ply', 3)).toContain('3 document line(s)')
  })

  it('applies defaults and bounds on JSON input', () => {
    const ok = itemInputSchema.safeParse({ name: 'Ply', rate: 10, taxRatePercent: 18 })
    expect(ok.success && ok.data.unit).toBe('NOS')
    expect(itemInputSchema.safeParse({ name: 'Ply', rate: -1, taxRatePercent: 18 }).success).toBe(false)
  })
})

describe('material rules', () => {
  it('numbers the next material after the last', () => {
    expect(nextSortOrder(undefined)).toBe(0)
    expect(nextSortOrder(4)).toBe(5)
  })

  it('plans swaps and refuses the ends', () => {
    const ids = ['a', 'b', 'c']
    expect(swapTarget(ids, 'b', 'up')).toEqual({ ok: true, index: 1, swapWith: 0 })
    expect(swapTarget(ids, 'b', 'down')).toEqual({ ok: true, index: 1, swapWith: 2 })
    expect(swapTarget(ids, 'a', 'up')).toEqual({ ok: false, error: 'Already at the end' })
    expect(swapTarget(ids, 'c', 'down')).toEqual({ ok: false, error: 'Already at the end' })
    expect(swapTarget(ids, 'x', 'up')).toEqual({ ok: false, error: 'Material not found' })
  })

  it('checks reorder levels', () => {
    expect(reorderLevelError(null)).toBeNull()
    expect(reorderLevelError(0)).toBeNull()
    expect(reorderLevelError(-1)).toBe('Reorder level cannot be negative')
    expect(reorderLevelError(Number.NaN)).toBe('Reorder level cannot be negative')
  })

  it('trims and requires names', () => {
    expect(materialNameSchema.parse('  Ply ')).toBe('Ply')
    expect(materialNameSchema.safeParse('   ').success).toBe(false)
  })
})

describe('partner and vendor rules', () => {
  it('refuses deleting a referenced partner', () => {
    expect(partnerReferenceError('Raj', { customers: 0, quotations: 0, orders: 0 })).toBeNull()
    expect(partnerReferenceError('Raj', { customers: 1, quotations: 0, orders: 2 })).toContain(
      '1 customer(s), 0 quotation(s) and 2 order(s)',
    )
  })

  it('builds the vendor picker detail', () => {
    expect(vendorDetail({ phone: '99', city: 'Surat', description: 'x' })).toBe('99 · Surat')
    expect(vendorDetail({ phone: null, city: null, description: 'Hardware' })).toBe('Hardware')
    expect(vendorDetail({ phone: null, city: null, description: null })).toBe('')
  })

  it('requires an as-of date with an opening balance', () => {
    expect(vendorInputSchema.safeParse({ name: 'V', openingPayable: '100' }).success).toBe(false)
  })
})
