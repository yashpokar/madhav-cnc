import { prisma } from '@/lib/prisma'
import {
  AGING_BUCKETS,
  bucketFor,
  daysOverdue,
  invoiceDue,
  openingRemaining,
  round2,
  startOfDay,
  uninvoicedDue,
  type AgingKey,
} from '@/lib/receivables-math'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

export { AGING_BUCKETS, bucketFor, daysOverdue }
export type { AgingKey }

export async function getReceivables(
  today = new Date(),
  range: { from?: string; to?: string } = {},
) {
  const ranged = Boolean(range.from || range.to)
  const paidOn = ranged
    ? {
        ...(range.from ? { gte: new Date(`${range.from}T00:00:00Z`) } : {}),
        ...(range.to ? { lte: new Date(`${range.to}T00:00:00Z`) } : {}),
      }
    : undefined

  const [invoices, notes, uninvoiced, recentPayments, allReceipts, openingCustomers] =
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
        writeOffs: { select: { amount: true } },
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
      where: paidOn ? { paidOn } : undefined,
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        number: true,
        paidOn: true,
        amount: true,
        mode: true,
        modeName: true,
        reference: true,
        orderId: true,
        openingApplied: true,
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
        orderId: true,
        openingApplied: true,
        allocations: { select: { amount: true } },
      },
    }),
    prisma.customer.findMany({
      where: { openingDue: { gt: 0 } },
      select: {
        id: true,
        name: true,
        phone: true,
        openingDue: true,
        openingAsOf: true,
      },
    }),
  ])

  // What receipts have already settled of each customer's opening balance.
  const openingAppliedBy = new Map<string, number>()

  for (const receipt of allReceipts) {
    const applied = num(receipt.openingApplied)

    if (applied > 0) {
      openingAppliedBy.set(
        receipt.customerId,
        round2((openingAppliedBy.get(receipt.customerId) ?? 0) + applied),
      )
    }
  }

  // Balances carried from before the system, aged from their "as of" date.
  const openingRows = openingCustomers
    .map((customer) => {
      const due = openingRemaining(
        num(customer.openingDue),
        openingAppliedBy.get(customer.id) ?? 0,
      )
      const overdueBy = customer.openingAsOf
        ? daysOverdue(customer.openingAsOf, today)
        : 0

      return {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
        },
        asOf: customer.openingAsOf,
        openingDue: num(customer.openingDue),
        due,
        overdueBy,
        bucket: bucketFor(overdueBy),
      }
    })
    .filter((row) => row.due > 0)

  const open = invoices
    .map((invoice) => {
      const paid = invoice.paymentAllocations.reduce(
        (sum, allocation) => sum + num(allocation.amount),
        0,
      )
      const writtenOff = invoice.writeOffs.reduce(
        (sum, row) => sum + num(row.amount),
        0,
      )
      const due = invoiceDue({
        total: num(invoice.total),
        advanceAdjusted: num(invoice.advanceAdjusted),
        allocated: paid,
        writtenOff,
      })
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

  // Open invoices plus what is left of the opening balances.
  const outstanding = round2(
    open.reduce((sum, row) => sum + row.due, 0) +
      openingRows.reduce((sum, row) => sum + row.due, 0),
  )
  const overdue = round2(
    [...open, ...openingRows]
      .filter((row) => row.overdueBy > 0)
      .reduce((sum, row) => sum + row.due, 0),
  )

  const aging = AGING_BUCKETS.map((bucket) => {
    const rows = [...open, ...openingRows].filter(
      (row) => row.bucket === bucket.key,
    )

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
    const unallocated = receipt.orderId
      ? 0
      : round2(num(receipt.amount) - allocated - num(receipt.openingApplied))

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

  for (const row of openingRows) {
    const existing = byCustomerMap.get(row.customer.id) ?? {
      id: row.customer.id,
      name: row.customer.name,
      phone: row.customer.phone,
      invoices: 0,
      due: 0,
      overdue: 0,
      oldestDays: 0,
    }

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

  const advanceByOrder = new Map<string, number>()

  for (const receipt of allReceipts) {
    if (!receipt.orderId) continue

    advanceByOrder.set(
      receipt.orderId,
      round2((advanceByOrder.get(receipt.orderId) ?? 0) + num(receipt.amount)),
    )
  }

  const toBill = uninvoiced.map((order) => ({
    ...order,
    total: num(order.total),
    waitingDays: daysOverdue(order.orderDate, today),
  }))

  // Delivered work that has no invoice yet is still money the customer owes,
  // less whatever was already paid against that order as an advance.
  const toBillDue = round2(
    toBill.reduce(
      (sum, order) =>
        sum + uninvoicedDue(order.total, advanceByOrder.get(order.id) ?? 0),
      0,
    ),
  )

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
    toBillDue,
    // The one definition of "what is owed": billed-and-open plus delivered-not-yet-billed.
    totalDue: round2(outstanding + toBillDue),
    collected30: collected._sum.amount ? num(collected._sum.amount) : 0,
    collected30Count: collected._count._all,
    aging,
    invoices: [...open].sort((a, b) => b.overdueBy - a.overdueBy),
    openingBalances: openingRows,
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
        modeName: payment.modeName,
        reference: payment.reference,
        customer: payment.customer,
        isAdvance: Boolean(payment.orderId),
        amount: num(payment.amount),
        allocated: round2(allocated),
        openingApplied: num(payment.openingApplied),
        unallocated: payment.orderId
          ? 0
          : round2(
              num(payment.amount) - allocated - num(payment.openingApplied),
            ),
        invoiceNumbers: payment.allocations.map(
          (allocation) => allocation.invoice.number,
        ),
      }
    }),
  }
}

export type Receivables = Awaited<ReturnType<typeof getReceivables>>

/**
 * One row per customer: what was billed, what came in, what is still due and
 * what was written off as not recoverable ("defaulted").
 */
export async function getCustomerLedger(today = new Date()) {
  const [invoices, payments, openingCustomers, openingApplied] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: 'ISSUED' },
      select: {
        total: true,
        advanceAdjusted: true,
        invoiceDate: true,
        dueDate: true,
        customer: { select: { id: true, name: true, phone: true } },
        paymentAllocations: { select: { amount: true } },
        writeOffs: { select: { amount: true } },
      },
    }),
    prisma.payment.groupBy({
      by: ['customerId'],
      _sum: { amount: true },
    }),
    prisma.customer.findMany({
      where: { openingDue: { gt: 0 } },
      select: {
        id: true,
        name: true,
        phone: true,
        openingDue: true,
        openingAsOf: true,
      },
    }),
    prisma.payment.groupBy({
      by: ['customerId'],
      where: { openingApplied: { gt: 0 } },
      _sum: { openingApplied: true },
    }),
  ])

  type Row = {
    id: string
    name: string
    phone: string
    billed: number
    received: number
    due: number
    overdue: number
    defaulted: number
    oldestDays: number
    /** Part of `due` that is the balance carried from before the system. */
    opening: number
  }

  const rows = new Map<string, Row>()

  for (const invoice of invoices) {
    const row = rows.get(invoice.customer.id) ?? {
      id: invoice.customer.id,
      name: invoice.customer.name,
      phone: invoice.customer.phone,
      billed: 0,
      received: 0,
      due: 0,
      overdue: 0,
      defaulted: 0,
      oldestDays: 0,
      opening: 0,
    }

    const paid = invoice.paymentAllocations.reduce(
      (sum, a) => sum + num(a.amount),
      0,
    )
    const writtenOff = invoice.writeOffs.reduce(
      (sum, w) => sum + num(w.amount),
      0,
    )
    const due = invoiceDue({
      total: num(invoice.total),
      advanceAdjusted: num(invoice.advanceAdjusted),
      allocated: paid,
      writtenOff,
    })

    row.billed = round2(row.billed + num(invoice.total))
    row.defaulted = round2(row.defaulted + writtenOff)

    if (due > 0) {
      const late = daysOverdue(invoice.dueDate ?? invoice.invoiceDate, today)

      row.due = round2(row.due + due)
      if (late > 0) {
        row.overdue = round2(row.overdue + due)
        row.oldestDays = Math.max(row.oldestDays, late)
      }
    }

    rows.set(row.id, row)
  }

  const received = new Map(
    payments.map((p) => [p.customerId, p._sum.amount ? num(p._sum.amount) : 0]),
  )

  const missing = [...received.keys()].filter((id) => !rows.has(id))

  if (missing.length > 0) {
    const customers = await prisma.customer.findMany({
      where: { id: { in: missing } },
      select: { id: true, name: true, phone: true },
    })

    for (const customer of customers) {
      rows.set(customer.id, {
        ...customer,
        billed: 0,
        received: 0,
        due: 0,
        overdue: 0,
        defaulted: 0,
        oldestDays: 0,
        opening: 0,
      })
    }
  }

  // The opening balance is its own amount in a customer's due, aged from its date.
  const appliedByCustomer = new Map(
    openingApplied.map((p) => [
      p.customerId,
      p._sum.openingApplied ? num(p._sum.openingApplied) : 0,
    ]),
  )

  for (const customer of openingCustomers) {
    const left = openingRemaining(
      num(customer.openingDue),
      appliedByCustomer.get(customer.id) ?? 0,
    )

    if (left <= 0) continue

    const row = rows.get(customer.id) ?? {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      billed: 0,
      received: 0,
      due: 0,
      overdue: 0,
      defaulted: 0,
      oldestDays: 0,
      opening: 0,
    }
    const late = customer.openingAsOf
      ? daysOverdue(customer.openingAsOf, today)
      : 0

    row.opening = left
    row.due = round2(row.due + left)

    if (late > 0) {
      row.overdue = round2(row.overdue + left)
      row.oldestDays = Math.max(row.oldestDays, late)
    }

    rows.set(row.id, row)
  }

  for (const row of rows.values()) {
    row.received = round2(received.get(row.id) ?? 0)
  }

  return [...rows.values()].sort(
    (a, b) => b.due - a.due || b.defaulted - a.defaulted || a.name.localeCompare(b.name),
  )
}

export type CustomerLedgerRow = Awaited<ReturnType<typeof getCustomerLedger>>[number]
