import { prisma } from '@/lib/prisma'
import { istDayKey, istInstant, rangesOverlap, type LayerKey } from '@/lib/calendar'
import type { DispatchStatus, OrderStatus } from '@/generated/prisma/enums'

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Most rows read per layer for one visible range. */
const LAYER_CAP = 1000

export type CalendarEntry = {
  kind: 'order'
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
  /** ISO of the order date (UTC midnight); used when there is no start time or due date. */
  orderDate: string
  total: number
  /** Deposit/advance and invoice receipts taken so far. */
  received: number
  balance: number
}

export type DeliveryEntry = {
  kind: 'delivery'
  /** Unique per chip: a dispatch can show once for leaving and once for arriving. */
  id: string
  dispatchId: string
  number: string
  status: DispatchStatus
  event: 'dispatched' | 'delivered'
  orderId: string
  orderNumber: string
  customerName: string
  /** Delivered entries carry the delivery instant so the time shows. */
  startsAt: string | null
  endsAt: null
  dueDate: string | null
}

export type InvoiceDueEntry = {
  kind: 'invoice'
  id: string
  number: string
  customerName: string
  total: number
  /** What is still unpaid after receipts, advance and write-offs. */
  due: number
  startsAt: null
  endsAt: null
  dueDate: string
}

export type PaymentsEntry = {
  kind: 'payments'
  id: string
  /** The India day the money came in. */
  day: string
  count: number
  total: number
  payments: { id: string; number: string; customerName: string; amount: number }[]
  startsAt: null
  endsAt: null
  dueDate: string
}

export type CalendarItem = CalendarEntry | DeliveryEntry | InvoiceDueEntry | PaymentsEntry

/**
 * Everything the calendar shows for [fromKey, toKey), limited to the layers
 * asked for (the caller only passes layers the person may see). Each layer
 * reads at most 1000 rows.
 */
export async function listCalendarItems({
  fromKey,
  toKey,
  includeCancelled,
  layers,
}: {
  fromKey: string
  toKey: string
  includeCancelled: boolean
  layers: readonly LayerKey[]
}): Promise<CalendarItem[]> {
  const [orders, deliveries, invoices, payments] = await Promise.all([
    layers.includes('orders')
      ? listCalendarEntries({ fromKey, toKey, includeCancelled })
      : [],
    layers.includes('deliveries') ? listDeliveries(fromKey, toKey) : [],
    layers.includes('invoices') ? listInvoicesDue(fromKey, toKey) : [],
    layers.includes('payments') ? listPaymentDays(fromKey, toKey) : [],
  ])

  return [...orders, ...deliveries, ...invoices, ...payments]
}

const dayStart = (key: string) => new Date(`${key}T00:00:00Z`)

async function listDeliveries(fromKey: string, toKey: string): Promise<DeliveryEntry[]> {
  const from = istInstant(fromKey)
  const to = istInstant(toKey)

  const rows = await prisma.dispatch.findMany({
    where: {
      status: { not: 'CANCELLED' },
      OR: [
        { dispatchDate: { gte: dayStart(fromKey), lt: dayStart(toKey) } },
        { deliveredAt: { gte: from, lt: to } },
      ],
    },
    orderBy: { dispatchDate: 'asc' },
    take: LAYER_CAP,
    select: {
      id: true,
      number: true,
      status: true,
      dispatchDate: true,
      deliveredAt: true,
      order: { select: { id: true, number: true, customer: { select: { name: true } } } },
    },
  })

  const inRange = (key: string) => key >= fromKey && key < toKey
  const items: DeliveryEntry[] = []

  for (const row of rows) {
    const base = {
      kind: 'delivery' as const,
      dispatchId: row.id,
      number: row.number,
      status: row.status,
      orderId: row.order.id,
      orderNumber: row.order.number,
      customerName: row.order.customer.name,
      endsAt: null,
    }
    const dispatchKey = row.dispatchDate.toISOString().slice(0, 10)
    const deliveredKey = row.deliveredAt ? istDayKey(row.deliveredAt) : null

    // Delivered the same day it left: one "Delivered" chip, not two.
    if (!(deliveredKey && deliveredKey === dispatchKey) && inRange(dispatchKey)) {
      items.push({
        ...base,
        id: `${row.id}:dispatched`,
        event: 'dispatched',
        startsAt: null,
        dueDate: row.dispatchDate.toISOString(),
      })
    }

    if (row.deliveredAt && deliveredKey && inRange(deliveredKey)) {
      items.push({
        ...base,
        id: `${row.id}:delivered`,
        event: 'delivered',
        startsAt: row.deliveredAt.toISOString(),
        dueDate: null,
      })
    }
  }

  return items
}

async function listInvoicesDue(fromKey: string, toKey: string): Promise<InvoiceDueEntry[]> {
  const rows = await prisma.invoice.findMany({
    where: {
      status: 'ISSUED',
      dueDate: { gte: dayStart(fromKey), lt: dayStart(toKey) },
    },
    orderBy: { dueDate: 'asc' },
    take: LAYER_CAP,
    select: {
      id: true,
      number: true,
      dueDate: true,
      total: true,
      advanceAdjusted: true,
      customer: { select: { name: true } },
      paymentAllocations: { select: { amount: true } },
      writeOffs: { select: { amount: true } },
    },
  })

  const items: InvoiceDueEntry[] = []

  for (const row of rows) {
    if (!row.dueDate) continue

    const total = row.total.toNumber()
    const settled =
      row.advanceAdjusted.toNumber() +
      row.paymentAllocations.reduce((sum, a) => sum + a.amount.toNumber(), 0) +
      row.writeOffs.reduce((sum, w) => sum + w.amount.toNumber(), 0)
    const due = round2(total - settled)

    // Fully settled invoices have nothing left to chase.
    if (due <= 0) continue

    items.push({
      kind: 'invoice',
      id: row.id,
      number: row.number,
      customerName: row.customer.name,
      total,
      due,
      startsAt: null,
      endsAt: null,
      dueDate: row.dueDate.toISOString(),
    })
  }

  return items
}

/** Receipts grouped per day, so a busy day is one chip. */
async function listPaymentDays(fromKey: string, toKey: string): Promise<PaymentsEntry[]> {
  const rows = await prisma.payment.findMany({
    where: { paidOn: { gte: dayStart(fromKey), lt: dayStart(toKey) } },
    orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
    take: LAYER_CAP,
    select: {
      id: true,
      number: true,
      amount: true,
      paidOn: true,
      customer: { select: { name: true } },
    },
  })

  const days = new Map<string, PaymentsEntry>()

  for (const row of rows) {
    const day = row.paidOn.toISOString().slice(0, 10)
    const amount = row.amount.toNumber()
    const entry =
      days.get(day) ??
      ({
        kind: 'payments',
        id: `payments:${day}`,
        day,
        count: 0,
        total: 0,
        payments: [],
        startsAt: null,
        endsAt: null,
        dueDate: row.paidOn.toISOString(),
      } satisfies PaymentsEntry)

    entry.count += 1
    entry.total = round2(entry.total + amount)
    entry.payments.push({
      id: row.id,
      number: row.number,
      customerName: row.customer.name,
      amount,
    })
    days.set(day, entry)
  }

  return [...days.values()]
}

/**
 * Orders for [fromKey, toKey) India days, by the best date each has: a start
 * time overlapping the range, else its due date, else its order date.
 * Every non-cancelled order is on the calendar somewhere.
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
        { startsAt: null, dueDate: { gte: dayStart(fromKey), lt: dayStart(toKey) } },
        {
          startsAt: null,
          dueDate: null,
          orderDate: { gte: dayStart(fromKey), lt: dayStart(toKey) },
        },
      ],
    },
    orderBy: [{ startsAt: 'asc' }, { dueDate: 'asc' }, { orderDate: 'asc' }],
    take: LAYER_CAP,
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
      orderDate: true,
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
      kind: 'order' as const,
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
      orderDate: order.orderDate.toISOString(),
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
