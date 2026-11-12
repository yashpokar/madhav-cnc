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

export async function getMoneyWatch() {
  const today = startOfToday()
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  )

  const [overdue, collected, overdueList] = await Promise.all([
    prisma.invoice.count({
      where: { status: 'ISSUED', dueDate: { lt: today } },
    }),
    prisma.payment.aggregate({
      where: { paidOn: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: { status: 'ISSUED', dueDate: { lt: today } },
      orderBy: { dueDate: 'asc' },
      take: 5,
      select: {
        id: true,
        number: true,
        dueDate: true,
        total: true,
        customer: { select: { name: true } },
      },
    }),
  ])

  return {
    overdueCount: overdue,
    collectedThisMonth: collected._sum.amount?.toNumber() ?? 0,
    overdueList: overdueList.map((invoice) => ({
      ...invoice,
      total: invoice.total.toNumber(),
    })),
  }
}
