import { isDayKey, scheduleFromFields } from '@/lib/calendar'
import type { OrderStatus, QuotationStatus } from '@/generated/prisma/enums'

/**
 * The pure rules of quotations and orders: which status can follow which, when
 * a document is locked, when it may be deleted. Kept free of the database so
 * the web actions, the API and the tests all read the same table.
 */

export const QUOTATION_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'DRAFT'],
  ACCEPTED: ['CONVERTED', 'SENT'],
  REJECTED: ['SENT'],
  EXPIRED: ['SENT'],
  CONVERTED: [],
}

/** A refusal message, or null when the move is allowed. */
export function quotationTransitionError(from: QuotationStatus, to: QuotationStatus): string | null {
  return QUOTATION_TRANSITIONS[from].includes(to)
    ? null
    : `A ${from.toLowerCase()} quotation cannot move to ${to.toLowerCase()}`
}

export function quotationEditError(status: QuotationStatus): string | null {
  return status === 'CONVERTED'
    ? 'This quotation has been converted to an order and cannot be edited'
    : null
}

export function quotationDeleteError(links: { orders: number; revisions: number }): string | null {
  return links.orders > 0 || links.revisions > 0
    ? 'This quotation has orders or later revisions linked to it. Delete those first.'
    : null
}

export function canConvertQuotation(status: QuotationStatus): boolean {
  return status === 'ACCEPTED' || status === 'CONVERTED'
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'CANCELLED', 'DRAFT'],
  IN_PRODUCTION: ['READY', 'CANCELLED'],
  READY: ['DISPATCHED', 'IN_PRODUCTION'],
  DISPATCHED: ['COMPLETED', 'READY'],
  COMPLETED: [],
  CANCELLED: [],
}

// Work can be corrected until the order is cancelled; once it is invoiced,
// the invoice is the record, so the order is locked.
export const ORDER_EDITABLE_STATUSES: OrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'COMPLETED',
]

const spaced = (status: OrderStatus) => status.toLowerCase().replace('_', ' ')

export function orderTransitionError(from: OrderStatus, to: OrderStatus): string | null {
  return ORDER_TRANSITIONS[from].includes(to)
    ? null
    : `An order that is ${spaced(from)} cannot move to ${spaced(to)}`
}

export function orderStatusMessage(status: OrderStatus): string {
  return `Marked as ${spaced(status)}`
}

export function orderEditError(order: { status: OrderStatus; invoiceCount: number }): string | null {
  if (order.invoiceCount > 0) {
    return 'This order has been invoiced, so it is locked. Change the invoice instead.'
  }

  if (!ORDER_EDITABLE_STATUSES.includes(order.status)) {
    return `An order that is ${spaced(order.status)} can no longer be edited`
  }

  return null
}

export function canTrackOrder(status: OrderStatus): boolean {
  return status !== 'CANCELLED'
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * The booking window a set of form fields describes, or null when it is not a
 * usable one (bad day, no start, ends before it starts). Bad clock times are
 * treated as "not given", as the order form does while it is being typed.
 */
export function scheduleWindow(input: {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}): { startsAt: Date; endsAt: Date | null } | null {
  if (!isDayKey(input.startDate) || (input.endDate && !isDayKey(input.endDate))) {
    return null
  }

  const { startsAt, endsAt } = scheduleFromFields({
    ...input,
    startTime: CLOCK.test(input.startTime) ? input.startTime : '',
    endTime: CLOCK.test(input.endTime) ? input.endTime : '',
  })

  if (!startsAt || (endsAt && endsAt < startsAt)) {
    return null
  }

  return { startsAt, endsAt }
}
