import { prisma } from '@/lib/prisma'

const OPEN_ORDER_STATUSES = [
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
] as const

function startOfToday() {
  const now = new Date()

  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

/** Quotations the customer has not answered yet. */
export async function getQuoteWatch() {
  const today = startOfToday()

  const [awaiting, expiringSoon, drafts, list] = await Promise.all([
    prisma.quotation.count({ where: { status: 'SENT' } }),
    prisma.quotation.count({
      where: {
        status: 'SENT',
        validUntil: { gte: today, lte: addDays(today, 3) },
      },
    }),
    prisma.quotation.count({ where: { status: 'DRAFT' } }),
    prisma.quotation.findMany({
      where: { status: 'SENT' },
      orderBy: [{ validUntil: 'asc' }, { createdAt: 'asc' }],
      take: 5,
      select: {
        id: true,
        number: true,
        validUntil: true,
        total: true,
        customer: { select: { name: true } },
      },
    }),
  ])

  return {
    awaiting,
    expiringSoon,
    drafts,
    list: list.map((quotation) => ({
      ...quotation,
      total: quotation.total.toNumber(),
    })),
  }
}

/** Open work ordered by due date, with overdue and due-this-week counts. */
export async function getOrderWatch() {
  const today = startOfToday()
  const weekEnd = addDays(today, 7)
  const open = { status: { in: [...OPEN_ORDER_STATUSES] } }

  const [overdue, dueThisWeek, openCount, readyToDispatch, list] =
    await Promise.all([
      prisma.order.count({ where: { ...open, dueDate: { lt: today } } }),
      prisma.order.count({
        where: { ...open, dueDate: { gte: today, lte: weekEnd } },
      }),
      prisma.order.count({ where: open }),
      prisma.order.count({ where: { status: 'READY' } }),
      prisma.order.findMany({
        where: open,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: 6,
        select: {
          id: true,
          number: true,
          status: true,
          dueDate: true,
          customer: { select: { name: true } },
        },
      }),
    ])

  return { overdue, dueThisWeek, openCount, readyToDispatch, list }
}

export async function getProductionWatch(userId: string) {
  const [inProgress, onHold, mine] = await Promise.all([
    prisma.productionTask.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.productionTask.count({ where: { status: 'ON_HOLD' } }),
    prisma.productionTask.findMany({
      where: {
        assignedToId: userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        order: { status: { in: ['IN_PRODUCTION', 'READY'] } },
      },
      orderBy: [{ order: { dueDate: 'asc' } }, { position: 'asc' }],
      take: 6,
      select: {
        id: true,
        status: true,
        stage: { select: { name: true } },
        order: {
          select: {
            id: true,
            number: true,
            dueDate: true,
            customer: { select: { name: true } },
          },
        },
      },
    }),
  ])

  return { inProgress, onHold, mine }
}

export async function getDispatchWatch() {
  const [drafts, inTransit] = await Promise.all([
    prisma.dispatch.count({ where: { status: 'DRAFT' } }),
    prisma.dispatch.count({ where: { status: 'DISPATCHED' } }),
  ])

  return { drafts, inTransit }
}

type Span = { from: Date; to: Date }

const sum = (value: { toNumber: () => number } | null | undefined) => value?.toNumber() ?? 0

/** Money and work figures for one stretch of days. */
async function activityFor(span: Span, scope: { money: boolean; expenses: boolean; orders: boolean; quotes: boolean }) {
  const between = { gte: span.from, lte: span.to }

  const [receipts, credits, spent, billed, orders, quotes] = await Promise.all([
    scope.money
      ? prisma.payment.aggregate({ where: { paidOn: between }, _sum: { amount: true } })
      : null,
    scope.money
      ? prisma.cashCredit.aggregate({ where: { entryDate: between }, _sum: { amount: true } })
      : null,
    scope.expenses
      ? prisma.expense.aggregate({ where: { expenseDate: between }, _sum: { total: true } })
      : null,
    scope.money
      ? prisma.invoice.aggregate({
          where: { status: 'ISSUED', invoiceDate: between },
          _sum: { total: true },
          _count: { _all: true },
        })
      : null,
    scope.orders
      ? prisma.order.aggregate({
          where: { status: { not: 'CANCELLED' }, orderDate: between },
          _sum: { total: true },
          _count: { _all: true },
        })
      : null,
    scope.quotes
      ? prisma.quotation.aggregate({
          where: { status: { not: 'DRAFT' }, quotationDate: between },
          _sum: { total: true },
          _count: { _all: true },
        })
      : null,
  ])

  return {
    received: sum(receipts?._sum.amount) + sum(credits?._sum.amount),
    spent: sum(spent?._sum.total),
    billed: sum(billed?._sum.total),
    billedCount: billed?._count._all ?? 0,
    orders: orders?._count._all ?? 0,
    ordersValue: sum(orders?._sum.total),
    quotes: quotes?._count._all ?? 0,
    quotesValue: sum(quotes?._sum.total),
  }
}

/** Money in and out for each day (or week, for long periods) of the range. */
async function moneySeries(span: Span, scope: { money: boolean; expenses: boolean }) {
  const between = { gte: span.from, lte: span.to }

  const [receipts, credits, expenses] = await Promise.all([
    scope.money
      ? prisma.payment.groupBy({ by: ['paidOn'], where: { paidOn: between }, _sum: { amount: true } })
      : [],
    scope.money
      ? prisma.cashCredit.groupBy({ by: ['entryDate'], where: { entryDate: between }, _sum: { amount: true } })
      : [],
    scope.expenses
      ? prisma.expense.groupBy({ by: ['expenseDate'], where: { expenseDate: between }, _sum: { total: true } })
      : [],
  ])

  const days = Math.round((span.to.getTime() - span.from.getTime()) / 86_400_000) + 1
  const step = days > 45 ? 7 : 1
  const buckets: { start: Date; end: Date; received: number; spent: number }[] = []

  for (let offset = 0; offset < days; offset += step) {
    const start = addDays(span.from, offset)
    const end = addDays(start, Math.min(step, days - offset) - 1)

    buckets.push({ start, end, received: 0, spent: 0 })
  }

  const put = (date: Date, key: 'received' | 'spent', amount: number) => {
    const bucket = buckets.find((b) => date >= b.start && date <= b.end)

    if (bucket) bucket[key] += amount
  }

  for (const row of receipts) put(row.paidOn, 'received', sum(row._sum.amount))
  for (const row of credits) put(row.entryDate, 'received', sum(row._sum.amount))
  for (const row of expenses) put(row.expenseDate, 'spent', sum(row._sum.total))

  return { buckets, weekly: step > 1 }
}

export async function getPeriodActivity(
  range: { from: Date; to: Date; prev: { from: Date; to: Date } },
  scope: { money: boolean; expenses: boolean; orders: boolean; quotes: boolean },
) {
  const [current, previous, series] = await Promise.all([
    activityFor(range, scope),
    activityFor(range.prev, scope),
    scope.money || scope.expenses ? moneySeries(range, scope) : null,
  ])

  return { current, previous, series }
}
