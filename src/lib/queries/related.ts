import { prisma } from '@/lib/prisma'

/** How many rows each related table shows before it points to the full list. */
export const RELATED_LIMIT = 25

const n = (value: { toNumber: () => number }) => value.toNumber()

export async function customerRelated(customerId: string) {
  const where = { customerId }

  const [quotations, orders, invoices, payments, notes] = await Promise.all([
    Promise.all([
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RELATED_LIMIT,
        select: {
          id: true,
          number: true,
          revision: true,
          status: true,
          quotationDate: true,
          total: true,
        },
      }),
    ]),
    Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RELATED_LIMIT,
        select: {
          id: true,
          number: true,
          status: true,
          orderDate: true,
          dueDate: true,
          total: true,
        },
      }),
    ]),
    Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RELATED_LIMIT,
        select: {
          id: true,
          number: true,
          status: true,
          invoiceDate: true,
          dueDate: true,
          total: true,
        },
      }),
    ]),
    Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { paidOn: 'desc' },
        take: RELATED_LIMIT,
        select: {
          id: true,
          number: true,
          paidOn: true,
          mode: true,
          amount: true,
        },
      }),
    ]),
    Promise.all([
      prisma.creditDebitNote.count({ where }),
      prisma.creditDebitNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RELATED_LIMIT,
        select: {
          id: true,
          number: true,
          kind: true,
          status: true,
          noteDate: true,
          total: true,
        },
      }),
    ]),
  ])

  return {
    quotations: {
      count: quotations[0],
      rows: quotations[1].map((r) => ({ ...r, total: n(r.total) })),
    },
    orders: {
      count: orders[0],
      rows: orders[1].map((r) => ({ ...r, total: n(r.total) })),
    },
    invoices: {
      count: invoices[0],
      rows: invoices[1].map((r) => ({ ...r, total: n(r.total) })),
    },
    payments: {
      count: payments[0],
      rows: payments[1].map((r) => ({ ...r, amount: n(r.amount) })),
    },
    notes: {
      count: notes[0],
      rows: notes[1].map((r) => ({ ...r, total: n(r.total) })),
    },
  }
}

export async function partnerRelated(partnerId: string) {
  const asPartner = { OR: [{ architectId: partnerId }, { carpenterId: partnerId }] }
  const customerWhere = {
    OR: [{ preferredArchitectId: partnerId }, { preferredCarpenterId: partnerId }],
  }

  const [customers, quotations, orders] = await Promise.all([
    Promise.all([
      prisma.customer.count({ where: customerWhere }),
      prisma.customer.findMany({
        where: customerWhere,
        orderBy: { name: 'asc' },
        take: RELATED_LIMIT,
        select: { id: true, code: true, name: true, phone: true, city: true, status: true },
      }),
    ]),
    Promise.all([
      prisma.quotation.count({ where: asPartner }),
      prisma.quotation.findMany({
        where: asPartner,
        orderBy: { createdAt: 'desc' },
        take: RELATED_LIMIT,
        select: {
          id: true,
          number: true,
          status: true,
          quotationDate: true,
          total: true,
          customer: { select: { name: true } },
        },
      }),
    ]),
    Promise.all([
      prisma.order.count({ where: asPartner }),
      prisma.order.findMany({
        where: asPartner,
        orderBy: { createdAt: 'desc' },
        take: RELATED_LIMIT,
        select: {
          id: true,
          number: true,
          status: true,
          orderDate: true,
          dueDate: true,
          total: true,
          customer: { select: { name: true } },
        },
      }),
    ]),
  ])

  return {
    customers: { count: customers[0], rows: customers[1] },
    quotations: {
      count: quotations[0],
      rows: quotations[1].map((r) => ({ ...r, total: n(r.total) })),
    },
    orders: {
      count: orders[0],
      rows: orders[1].map((r) => ({ ...r, total: n(r.total) })),
    },
  }
}

export async function itemRelated(itemId: string) {
  const where = { itemId }

  const [quotations, orders, invoices] = await Promise.all([
    Promise.all([
      prisma.quotationLine.count({ where }),
      prisma.quotationLine.findMany({
        where,
        orderBy: { quotation: { createdAt: 'desc' } },
        take: RELATED_LIMIT,
        select: {
          id: true,
          quantity: true,
          rate: true,
          quotation: {
            select: {
              id: true,
              number: true,
              status: true,
              quotationDate: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
    ]),
    Promise.all([
      prisma.orderLine.count({ where }),
      prisma.orderLine.findMany({
        where,
        orderBy: { order: { createdAt: 'desc' } },
        take: RELATED_LIMIT,
        select: {
          id: true,
          quantity: true,
          rate: true,
          order: {
            select: {
              id: true,
              number: true,
              status: true,
              orderDate: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
    ]),
    Promise.all([
      prisma.invoiceLine.count({ where }),
      prisma.invoiceLine.findMany({
        where,
        orderBy: { invoice: { createdAt: 'desc' } },
        take: RELATED_LIMIT,
        select: {
          id: true,
          quantity: true,
          rate: true,
          invoice: {
            select: {
              id: true,
              number: true,
              status: true,
              invoiceDate: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
    ]),
  ])

  const money = <T extends { quantity: { toNumber: () => number }; rate: { toNumber: () => number } }>(
    row: T,
  ) => ({ ...row, quantity: n(row.quantity), rate: n(row.rate) })

  return {
    quotations: { count: quotations[0], rows: quotations[1].map(money) },
    orders: { count: orders[0], rows: orders[1].map(money) },
    invoices: { count: invoices[0], rows: invoices[1].map(money) },
  }
}

export async function orderRelated(orderId: string) {
  const [dispatches, invoices, expenses] = await Promise.all([
    prisma.dispatch.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: RELATED_LIMIT,
      select: {
        id: true,
        number: true,
        status: true,
        dispatchDate: true,
        vehicleNumber: true,
      },
    }),
    prisma.invoice.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: RELATED_LIMIT,
      select: {
        id: true,
        number: true,
        status: true,
        invoiceDate: true,
        dueDate: true,
        total: true,
      },
    }),
    prisma.expense.findMany({
      where: { orderId },
      orderBy: { expenseDate: 'desc' },
      take: RELATED_LIMIT,
      select: {
        id: true,
        number: true,
        expenseDate: true,
        payeeName: true,
        description: true,
        total: true,
      },
    }),
  ])

  return {
    dispatches,
    invoices: invoices.map((r) => ({ ...r, total: n(r.total) })),
    expenses: expenses.map((r) => ({ ...r, total: n(r.total) })),
  }
}

export async function quotationRelated(quotationId: string, parentId: string | null) {
  const [orders, revisions] = await Promise.all([
    prisma.order.findMany({
      where: { quotationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        orderDate: true,
        dueDate: true,
        total: true,
      },
    }),
    prisma.quotation.findMany({
      where: {
        OR: [{ parentId: quotationId }, ...(parentId ? [{ id: parentId }] : [])],
      },
      orderBy: { revision: 'asc' },
      select: {
        id: true,
        number: true,
        revision: true,
        status: true,
        quotationDate: true,
        total: true,
      },
    }),
  ])

  return {
    orders: orders.map((r) => ({ ...r, total: n(r.total) })),
    revisions: revisions.map((r) => ({ ...r, total: n(r.total) })),
  }
}

export async function invoiceRelated(invoiceId: string) {
  const notes = await prisma.creditDebitNote.findMany({
    where: { invoiceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      kind: true,
      status: true,
      noteDate: true,
      total: true,
    },
  })

  return { notes: notes.map((r) => ({ ...r, total: n(r.total) })) }
}
