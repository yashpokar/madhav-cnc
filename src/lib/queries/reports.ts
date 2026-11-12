import { prisma } from '@/lib/prisma'

type DecimalLike = { toNumber: () => number }

const num = (value: DecimalLike | null | undefined) =>
  value ? value.toNumber() : 0

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

function monthStart(date: Date, offset = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

/** Issued invoice totals per month for the trailing 12 months (oldest first). */
export async function salesByMonth(today = new Date()) {
  const from = monthStart(today, -11)

  const invoices = await prisma.invoice.findMany({
    where: { status: 'ISSUED', invoiceDate: { gte: from } },
    select: { invoiceDate: true, total: true },
  })

  const buckets = Array.from({ length: 12 }, (_, index) => {
    const start = monthStart(today, -11 + index)

    return {
      key: start.toISOString().slice(0, 7),
      label: MONTH_LABEL.format(start),
      total: 0,
      count: 0,
    }
  })
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))

  for (const invoice of invoices) {
    const bucket = byKey.get(invoice.invoiceDate.toISOString().slice(0, 7))

    if (bucket) {
      bucket.total = round2(bucket.total + num(invoice.total))
      bucket.count += 1
    }
  }

  return buckets
}

export async function topCustomers(today = new Date(), limit = 5) {
  const from = monthStart(today, -11)

  const rows = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: { status: 'ISSUED', invoiceDate: { gte: from } },
    _sum: { total: true },
    _count: { _all: true },
    orderBy: { _sum: { total: 'desc' } },
    take: limit,
  })

  const customers = await prisma.customer.findMany({
    where: { id: { in: rows.map((row) => row.customerId) } },
    select: { id: true, name: true },
  })
  const names = new Map(customers.map((customer) => [customer.id, customer.name]))

  return rows.map((row) => ({
    customerId: row.customerId,
    name: names.get(row.customerId) ?? 'Unknown',
    total: num(row._sum.total),
    count: row._count._all,
  }))
}

export async function quotationFunnel(today = new Date()) {
  const since = new Date(today.getTime() - 90 * 86_400_000)

  const rows = await prisma.quotation.groupBy({
    by: ['status'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  })

  const total = rows.reduce((sum, row) => sum + row._count._all, 0)
  const won = rows
    .filter((row) => row.status === 'ACCEPTED' || row.status === 'CONVERTED')
    .reduce((sum, row) => sum + row._count._all, 0)

  return {
    total,
    won,
    rate: total > 0 ? Math.round((won / total) * 100) : 0,
    byStatus: rows.map((row) => ({ status: row.status, count: row._count._all })),
  }
}

export async function ordersByStatus() {
  const rows = await prisma.order.groupBy({
    by: ['status'],
    _count: { _all: true },
  })

  return rows.map((row) => ({ status: row.status, count: row._count._all }))
}

export async function listPaymentsForExport({ search }: { search?: string } = {}) {
  const term = search?.trim()

  const payments = await prisma.payment.findMany({
    where: term
      ? {
          OR: [
            { number: { contains: term, mode: 'insensitive' } },
            { reference: { contains: term, mode: 'insensitive' } },
            { customer: { name: { contains: term, mode: 'insensitive' } } },
          ],
        }
      : {},
    orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
    select: {
      number: true,
      paidOn: true,
      amount: true,
      mode: true,
      reference: true,
      customer: { select: { name: true } },
      allocations: { select: { amount: true, invoice: { select: { number: true } } } },
    },
  })

  return payments.map((payment) => {
    const allocated = payment.allocations.reduce(
      (sum, allocation) => sum + num(allocation.amount),
      0,
    )

    return {
      number: payment.number,
      paidOn: payment.paidOn,
      customer: payment.customer.name,
      mode: payment.mode,
      reference: payment.reference,
      amount: num(payment.amount),
      allocated: round2(allocated),
      invoices: payment.allocations.map((a) => a.invoice.number).join(' '),
    }
  })
}
