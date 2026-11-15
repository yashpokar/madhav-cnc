import { describe, expect, it } from 'vitest'
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  dispatchStatusText,
  isFullyDelivered,
  quantityProblem,
} from '@/lib/dispatch-rules'
import { dispatchInputSchema, dispatchReceiptSchema } from '@/lib/validation/dispatches'

describe('dispatch status machine', () => {
  it('allows the documented moves only', () => {
    expect(canTransition('DRAFT', 'DISPATCHED')).toBe(true)
    expect(canTransition('DISPATCHED', 'DELIVERED')).toBe(true)
    expect(canTransition('DELIVERED', 'DISPATCHED')).toBe(true)
    expect(canTransition('DRAFT', 'DELIVERED')).toBe(false)
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false)
  })

  it('treats cancelled as final', () => {
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([])
  })

  it('words each status for the activity trail', () => {
    expect(dispatchStatusText('DISPATCHED')).toBe('dispatched')
    expect(dispatchStatusText('DRAFT')).toBe('back to draft')
  })
})

describe('quantityProblem', () => {
  const lines = [
    { id: 'a', description: 'Door', ordered: 10, alreadySent: 4 },
    { id: 'b', description: 'Frame', ordered: 2, alreadySent: 0 },
  ]

  it('accepts quantities within what is left', () => {
    expect(quantityProblem(lines, [{ orderLineId: 'a', quantity: 6 }])).toBeNull()
  })

  it('tolerates rounding noise', () => {
    expect(quantityProblem(lines, [{ orderLineId: 'a', quantity: 6.0004 }])).toBeNull()
  })

  it('names the line and what is left when over', () => {
    expect(quantityProblem(lines, [{ orderLineId: 'a', quantity: 7 }])).toBe(
      'Door: only 6 left to dispatch',
    )
  })

  it('rejects a line from another order', () => {
    expect(quantityProblem(lines, [{ orderLineId: 'zzz', quantity: 1 }])).toBe(
      'A line does not belong to this order',
    )
  })
})

describe('isFullyDelivered', () => {
  it('needs every line delivered in full', () => {
    expect(isFullyDelivered([{ ordered: 5, delivered: 5 }])).toBe(true)
    expect(
      isFullyDelivered([
        { ordered: 5, delivered: 5 },
        { ordered: 2, delivered: 1 },
      ]),
    ).toBe(false)
  })
})

describe('dispatch input', () => {
  const base = {
    orderId: 'o1',
    dispatchDate: '2026-01-05',
    lines: [{ orderLineId: 'l1', description: 'Door', unit: 'NOS', quantity: 2 }],
  }

  it('accepts JSON-native input and fills defaults', () => {
    const parsed = dispatchInputSchema.parse(base)
    expect(parsed.status).toBe('DRAFT')
    expect(parsed.dispatchDate.toISOString()).toBe('2026-01-05T00:00:00.000Z')
    expect(parsed.vehicleNumber).toBeNull()
  })

  it('requires at least one line and a six digit pincode', () => {
    expect(dispatchInputSchema.safeParse({ ...base, lines: [] }).success).toBe(false)
    expect(dispatchInputSchema.safeParse({ ...base, deliveryPincode: '123' }).success).toBe(false)
  })

  it('requires a receiver name', () => {
    expect(dispatchReceiptSchema.safeParse({ receivedByName: ' ' }).success).toBe(false)
  })
})
