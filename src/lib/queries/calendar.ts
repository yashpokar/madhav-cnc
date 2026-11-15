import { prisma } from '@/lib/prisma'
import { istInstant, rangesOverlap } from '@/lib/calendar'
import type { OrderStatus } from '@/generated/prisma/enums'

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export type CalendarEntry = {
  id: string
  number: string
  status: OrderStatus
  subject: string | null
  customerName: string
  customerPhone: string | null
  venue: string | null
  headcount: number | null
  /** ISO instants; null when the order is placed by its due date. */
  startsAt: string | null
  endsAt: string | null
  /** ISO of the date-only due date (UTC midnight). */
  dueDate: string | null
  total: number
  /** Deposit/advance and invoice receipts taken so far. */
  received: number
  balance: number
}

/**
 * Orders that fall in [fromKey, toKey) India days: those with a start time
 * overlapping the range, plus those with no start time whose due date is in it.
 * Cancelled orders are left out unless asked for.
 *
 * Money: the advance on the order (kept as an ADV receipt in Payments) plus
 * what is allocated to its issued invoices. An invoice's "advance adjusted" is
 * that same advance being applied, so it is not added again.
 */
export async function listCalendarEntries({
  fromKey,
  toKey,
  includeCancelled,
}: {
  fromKey: string
  toKey: string
  includeCancelled: boolean
}): Promise<CalendarEntry[]> {
  const from = istInstant(fromKey)
  const to = istInstant(toKey)

  const orders = await prisma.order.findMany({
    where: {
      ...(includeCancelled ? {} : { status: { not: 'CANCELLED' } }),
      OR: [
        {
          startsAt: { lt: to },
          OR: [{ endsAt: { gte: from } }, { endsAt: null, startsAt: { gte: from } }],
        },
        { startsAt: null, dueDate: { gte: new Date(`${fromKey}T00:00:00Z`), lt: new Date(`${toKey}T00:00:00Z`) } },
      ],
    },
    orderBy: [{ startsAt: 'asc' }, { dueDate: 'asc' }],
    take: 1000,
    select: {
      id: true,
      number: true,
      status: true,
      subject: true,
      venue: true,
      headcount: true,
      startsAt: true,
      endsAt: true,
      dueDate: true,
      total: true,
      advanceAmount: true,
      customer: { select: { name: true, phone: true } },
      invoices: {
        where: { status: 'ISSUED' },
        select: { paymentAllocations: { select: { amount: true } } },
      },
    },
  })

  return orders.map((order) => {
    const total = order.total.toNumber()
    const received = round2(
      order.advanceAmount.toNumber() +
        order.invoices.reduce(
          (sum, invoice) =>
            sum + invoice.paymentAllocations.reduce((s, a) => s + a.amount.toNumber(), 0),
          0,
        ),
    )

    return {
      id: order.id,
      number: order.number,
      status: order.status,
      subject: order.subject,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      venue: order.venue,
      headcount: order.headcount,
      startsAt: order.startsAt?.toISOString() ?? null,
      endsAt: order.endsAt?.toISOString() ?? null,
      dueDate: order.dueDate?.toISOString() ?? null,
      total,
      received,
      balance: Math.max(round2(total - received), 0),
    }
  })
}

/** Other live orders of the active company whose time range overlaps this one. */
export async function findScheduleConflicts({
  startsAt,
  endsAt,
  excludeId,
}: {
  startsAt: Date
  endsAt: Date | null
  excludeId?: string | null
}) {
  const range = { start: startsAt, end: endsAt }
  const searchEnd = new Date(Math.max((endsAt ?? startsAt).getTime(), startsAt.getTime() + 60_000))

  const candidates = await prisma.order.findMany({
    where: {
      status: { not: 'CANCELLED' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsAt: { not: null, lt: searchEnd },
      OR: [{ endsAt: { gt: startsAt } }, { endsAt: null, startsAt: { gte: startsAt } }],
    },
    orderBy: { startsAt: 'asc' },
    take: 50,
    select: {
      id: true,
      number: true,
      startsAt: true,
      endsAt: true,
      customer: { select: { name: true } },
    },
  })

  return candidates
    .filter(
      (order) =>
        order.startsAt && rangesOverlap(range, { start: order.startsAt, end: order.endsAt }),
    )
    .map((order) => ({ id: order.id, number: order.number, customerName: order.customer.name }))
}
