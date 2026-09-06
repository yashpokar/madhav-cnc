import { prisma } from '@/lib/prisma'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export const AGING_BUCKETS = [
  { key: 'notDue', label: 'Not due', from: -Infinity, to: 0 },
  { key: 'b30', label: '1 – 30 days', from: 1, to: 30 },
  { key: 'b60', label: '31 – 60 days', from: 31, to: 60 },
  { key: 'b90', label: '61 – 90 days', from: 61, to: 90 },
  { key: 'b90plus', label: 'Over 90 days', from: 91, to: Infinity },
] as const

export type AgingKey = (typeof AGING_BUCKETS)[number]['key']

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

export function daysOverdue(reference: Date, today: Date): number {
  const ms = startOfDay(today).getTime() - startOfDay(reference).getTime()

  return Math.floor(ms / 86_400_000)
}

export function bucketFor(days: number): AgingKey {
  const match = AGING_BUCKETS.find(
    (bucket) => days >= bucket.from && days <= bucket.to,
  )

  return (match ?? AGING_BUCKETS[0]).key
}

export async function getReceivables(today = new Date()) {
  const [invoices, notes, uninvoiced, recentPayments, allReceipts] =
    await Promise.all([
    prisma.invoice.findMany({
      where: { status: 'ISSUED' },
      orderBy: { invoiceDate: 'asc' },
      select: {
        id: true,
        number: true,
        invoiceDate: true,
        dueDate: true,
        total: true,
        advanceAdjusted: true,
        customer: { select: { id: true, name: true, phone: true } },
        order: { select: { id: true, number: true } },
        paymentAllocations: { select: { amount: true } },
      },
    }),
    prisma.creditDebitNote.findMany({
      where: { status: 'ISSUED', partyType: 'CUSTOMER', kind: 'CREDIT' },
      select: {
        id: true,
        number: true,
        noteDate: true,
        total: true,
        customerId: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        status: { in: ['READY', 'DISPATCHED', 'COMPLETED'] },
        invoices: { none: { status: { not: 'CANCELLED' } } },
      },
      orderBy: { orderDate: 'asc' },
      select: {
        id: true,
        number: true,
        orderDate: true,
        status: true,
        total: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.payment.findMany({
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      take: 25,
      select: {
        id: true,
        number: true,
        paidOn: true,
        amount: true,
        mode: true,
        reference: true,
        customer: { select: { id: true, name: true } },
        allocations: {
          select: { amount: true, invoice: { select: { number: true } } },
        },
      },
    }),
    prisma.payment.findMany({
      select: {
        amount: true,
        customerId: true,
        customer: { select: { id: true, name: true } },
        allocations: { select: { amount: true } },
      },
    }),
  ])

  const open = invoices
    .map((invoice) => {
      const paid = invoice.paymentAllocations.reduce(
        (sum, allocation) => sum + num(allocation.amount),
        0,
      )
      const due = round2(
        num(invoice.total) - num(invoice.advanceAdjusted) - paid,
      )
      const reference = invoice.dueDate ?? invoice.invoiceDate
      const overdueBy = daysOverdue(reference, today)

      return {
        id: invoice.id,
        number: invoice.number,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        customer: invoice.customer,
        order: invoice.order,
        total: num(invoice.total),
        paid: round2(paid + num(invoice.advanceAdjusted)),
        due,
        overdueBy,
        bucket: bucketFor(overdueBy),
      }
    })
    .filter((invoice) => invoice.due > 0)

  const outstanding = round2(open.reduce((sum, row) => sum + row.due, 0))
  const overdue = round2(
    open
      .filter((row) => row.overdueBy > 0)
      .reduce((sum, row) => sum + row.due, 0),
  )

  const aging = AGING_BUCKETS.map((bucket) => {
    const rows = open.filter((row) => row.bucket === bucket.key)

    return {
      key: bucket.key,
      label: bucket.label,
      count: rows.length,
      amount: round2(rows.reduce((sum, row) => sum + row.due, 0)),
    }
  })

  const onAccountByCustomer = new Map<string, number>()
  const onAccountNames = new Map<string, string>()

  for (const receipt of allReceipts) {
    const allocated = receipt.allocations.reduce(
      (sum, allocation) => sum + num(allocation.amount),
      0,
    )
    const unallocated = round2(num(receipt.amount) - allocated)

    if (unallocated <= 0) continue

    onAccountByCustomer.set(
      receipt.customerId,
      round2((onAccountByCustomer.get(receipt.customerId) ?? 0) + unallocated),
    )
    onAccountNames.set(receipt.customerId, receipt.customer.name)
  }

  const creditByCustomer = new Map<string, number>()

  for (const note of notes) {
    if (!note.customerId) continue

    creditByCustomer.set(
      note.customerId,
      round2((creditByCustomer.get(note.customerId) ?? 0) + num(note.total)),
    )
  }

  const byCustomerMap = new Map<
    string,
    {
      id: string
      name: string
      phone: string
      invoices: number
      due: number
      overdue: number
      oldestDays: number
    }
  >()

  for (const row of open) {
    const existing = byCustomerMap.get(row.customer.id) ?? {
      id: row.customer.id,
      name: row.customer.name,
      phone: row.customer.phone,
      invoices: 0,
      due: 0,
      overdue: 0,
      oldestDays: 0,
    }

    existing.invoices += 1
    existing.due = round2(existing.due + row.due)
    existing.overdue = round2(
      existing.overdue + (row.overdueBy > 0 ? row.due : 0),
    )
    existing.oldestDays = Math.max(existing.oldestDays, row.overdueBy)

    byCustomerMap.set(row.customer.id, existing)
  }

  for (const customerId of creditByCustomer.keys()) {
    if (byCustomerMap.has(customerId)) continue

    const customer = notes.find(
      (entry) => entry.customerId === customerId,
    )?.customer

    if (!customer) continue

    byCustomerMap.set(customerId, {
      id: customer.id,
      name: customer.name,
      phone: '',
      invoices: 0,
      due: 0,
      overdue: 0,
      oldestDays: 0,
    })
  }

  for (const [customerId, name] of onAccountNames) {
    if (byCustomerMap.has(customerId)) continue

    byCustomerMap.set(customerId, {
      id: customerId,
      name,
      phone: '',
      invoices: 0,
      due: 0,
      overdue: 0,
      oldestDays: 0,
    })
  }

  const byCustomer = [...byCustomerMap.values()]
    .map((row) => {
      const credit = creditByCustomer.get(row.id) ?? 0
      const onAccount = onAccountByCustomer.get(row.id) ?? 0

      return {
        ...row,
        credit,
        onAccount,
        net: round2(row.due - credit - onAccount),
      }
    })
    .sort((a, b) => b.net - a.net)

  const creditOutstanding = round2(
    [...creditByCustomer.values()].reduce((sum, value) => sum + value, 0),
  )

  const onAccountTotal = round2(
    [...onAccountByCustomer.values()].reduce((sum, value) => sum + value, 0),
  )

  const toBill = uninvoiced.map((order) => ({
    ...order,
    total: num(order.total),
    waitingDays: daysOverdue(order.orderDate, today),
  }))

  const thirtyDaysAgo = new Date(startOfDay(today).getTime() - 30 * 86_400_000)

  const collected = await prisma.payment.aggregate({
    where: { paidOn: { gte: thirtyDaysAgo } },
    _sum: { amount: true },
    _count: { _all: true },
  })

  return {
    outstanding,
    overdue,
    creditOutstanding,
    onAccountTotal,
    netReceivable: round2(outstanding - creditOutstanding - onAccountTotal),
    toBillTotal: round2(toBill.reduce((sum, order) => sum + order.total, 0)),
    collected30: collected._sum.amount ? num(collected._sum.amount) : 0,
    collected30Count: collected._count._all,
    aging,
    invoices: [...open].sort((a, b) => b.overdueBy - a.overdueBy),
    byCustomer,
    toBill,
    payments: recentPayments.map((payment) => {
      const allocated = payment.allocations.reduce(
        (sum, allocation) => sum + num(allocation.amount),
        0,
      )

      return {
        id: payment.id,
        number: payment.number,
        paidOn: payment.paidOn,
        mode: payment.mode,
        reference: payment.reference,
        customer: payment.customer,
        amount: num(payment.amount),
        allocated: round2(allocated),
        unallocated: round2(num(payment.amount) - allocated),
        invoiceNumbers: payment.allocations.map(
          (allocation) => allocation.invoice.number,
        ),
      }
    }),
  }
}

export type Receivables = Awaited<ReturnType<typeof getReceivables>>
