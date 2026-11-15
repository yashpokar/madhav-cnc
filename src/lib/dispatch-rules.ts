/**
 * Pure rules for delivery challans: which status moves are allowed, how much
 * of an order line is still left to send and whether an order is fully
 * delivered. No database here so the rules can be tested on their own.
 */

export type DispatchState = 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'

/** Challans in these states count against the quantity left on an order line. */
export const COUNTS_AS_SENT: DispatchState[] = ['DRAFT', 'DISPATCHED', 'DELIVERED']

export const ALLOWED_TRANSITIONS: Record<DispatchState, DispatchState[]> = {
  DRAFT: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'DRAFT', 'CANCELLED'],
  DELIVERED: ['DISPATCHED'],
  CANCELLED: [],
}

export function canTransition(from: DispatchState, to: DispatchState) {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

const TOLERANCE = 0.0005

export type LineQuantities = {
  id: string
  description: string
  ordered: number
  /** Quantity already on other challans that count as sent. */
  alreadySent: number
}

/**
 * Checks requested quantities against what is left on each order line.
 * Returns the message for the first problem, or null.
 */
export function quantityProblem(
  lines: readonly LineQuantities[],
  requested: readonly { orderLineId: string; quantity: number }[],
): string | null {
  const byId = new Map(lines.map((line) => [line.id, line]))

  for (const line of requested) {
    const orderLine = byId.get(line.orderLineId)

    if (!orderLine) return 'A line does not belong to this order'

    const remaining = orderLine.ordered - orderLine.alreadySent

    if (line.quantity > remaining + TOLERANCE) {
      return `${orderLine.description}: only ${Math.round(remaining * 1000) / 1000} left to dispatch`
    }
  }

  return null
}

/** True when every order line has been delivered in full. */
export function isFullyDelivered(
  lines: readonly { ordered: number; delivered: number }[],
) {
  return lines.every((line) => line.delivered >= line.ordered - TOLERANCE)
}

export function dispatchStatusText(status: DispatchState) {
  return status === 'DISPATCHED'
    ? 'dispatched'
    : status === 'DELIVERED'
      ? 'delivered'
      : status === 'CANCELLED'
        ? 'cancelled'
        : 'back to draft'
}
