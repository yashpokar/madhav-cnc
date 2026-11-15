import { describe, expect, it } from 'vitest'
import {
  ORDER_TRANSITIONS,
  canTrackOrder,
  orderEditError,
  orderStatusMessage,
  orderTransitionError,
  scheduleWindow,
} from '@/lib/sales-rules'
import { orderInputSchema, orderJsonSchema } from '@/lib/validation/orders'

describe('order status rules', () => {
  it('allows forward and documented back moves', () => {
    expect(orderTransitionError('DRAFT', 'CONFIRMED')).toBeNull()
    expect(orderTransitionError('CONFIRMED', 'IN_PRODUCTION')).toBeNull()
    expect(orderTransitionError('READY', 'IN_PRODUCTION')).toBeNull()
    expect(orderTransitionError('DISPATCHED', 'READY')).toBeNull()
  })

  it('words refusals with spaced status names', () => {
    expect(orderTransitionError('CONFIRMED', 'COMPLETED')).toBe(
      'An order that is confirmed cannot move to completed',
    )
    expect(orderTransitionError('IN_PRODUCTION', 'DRAFT')).toBe(
      'An order that is in production cannot move to draft',
    )
  })

  it('has no way out of completed or cancelled', () => {
    expect(ORDER_TRANSITIONS.COMPLETED).toEqual([])
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([])
    expect(orderStatusMessage('IN_PRODUCTION')).toBe('Marked as in production')
  })

  it('locks invoiced orders, then non-editable statuses', () => {
    expect(orderEditError({ status: 'DRAFT', invoiceCount: 1 })).toMatch(/invoiced/)
    expect(orderEditError({ status: 'CANCELLED', invoiceCount: 0 })).toBe(
      'An order that is cancelled can no longer be edited',
    )
    expect(orderEditError({ status: 'DISPATCHED', invoiceCount: 0 })).toMatch(/dispatched/)
    expect(orderEditError({ status: 'COMPLETED', invoiceCount: 0 })).toBeNull()
  })

  it('tracks everything except cancelled', () => {
    expect(canTrackOrder('CONFIRMED')).toBe(true)
    expect(canTrackOrder('CANCELLED')).toBe(false)
  })
})

describe('scheduleWindow', () => {
  const blank = { startDate: '', startTime: '', endDate: '', endTime: '' }

  it('needs a valid start day', () => {
    expect(scheduleWindow(blank)).toBeNull()
    expect(scheduleWindow({ ...blank, startDate: '2026-02-30' })).toBeNull()
  })

  it('returns an open-ended window with just a start', () => {
    const window = scheduleWindow({ ...blank, startDate: '2026-03-01', startTime: '10:00' })

    expect(window?.endsAt).toBeNull()
    expect(window?.startsAt.toISOString()).toBe('2026-03-01T04:30:00.000Z')
  })

  it('ignores a malformed clock and rejects an end before the start', () => {
    const window = scheduleWindow({ ...blank, startDate: '2026-03-01', startTime: '25:00' })

    expect(window?.startsAt.toISOString()).toBe('2026-02-28T18:30:00.000Z')
    expect(
      scheduleWindow({
        startDate: '2026-03-02',
        startTime: '',
        endDate: '2026-03-01',
        endTime: '',
      }),
    ).toBeNull()
  })
})

describe('order input schema', () => {
  const base = {
    customerId: 'c1',
    orderDate: '2026-01-05',
    lines: [{ description: 'Bed', unit: 'NOS', quantity: 1, rate: 500 }],
  }

  it('accepts advance details as an object (JSON) or a string (form)', () => {
    const json = orderJsonSchema.safeParse({
      ...base,
      advanceAmount: 100,
      advanceChannelId: 'x',
      advancePaymentDetails: { reference: 'R1' },
    })
    const form = orderInputSchema.safeParse({
      ...base,
      advanceAmount: 100,
      advanceChannelId: 'x',
      advancePaymentDetails: '{"reference":"R1"}',
    })

    expect(json.success).toBe(true)
    expect(form.success).toBe(true)
  })

  it('turns schedule fields into instants', () => {
    const parsed = orderJsonSchema.parse({
      ...base,
      startDate: '2026-03-01',
      startTime: '10:00',
      endDate: '2026-03-02',
      endTime: '18:00',
    })

    expect(parsed.startsAt?.toISOString()).toBe('2026-03-01T04:30:00.000Z')
    expect(parsed.endsAt?.toISOString()).toBe('2026-03-02T12:30:00.000Z')
  })

  it('rejects an end before the start and a time with no date', () => {
    const early = orderJsonSchema.safeParse({
      ...base,
      startDate: '2026-03-02',
      endDate: '2026-03-01',
    })
    const noDate = orderJsonSchema.safeParse({ ...base, startTime: '10:00' })

    expect(early.success).toBe(false)
    expect(noDate.success).toBe(false)
  })
})
