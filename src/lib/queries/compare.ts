import { prisma } from '@/lib/prisma'
import { buildCompare, fetchFrom, type MetricKey, type MetricRows, type Row } from '@/lib/compare-build'
import { periodEnd, periodStart, type PeriodType } from '@/lib/compare-math'
import { todayInIndia } from '@/lib/dashboard-range'

type DecimalLike = { toNumber: () => number }

const num = (value: DecimalLike | null | undefined) => (value ? value.toNumber() : 0)

const IST_OFFSET = 5.5 * 3_600_000

/** An instant as the India calendar day it falls on (UTC midnight). */
const indiaDay = (instant: Date) => {
  const shifted = new Date(instant.getTime() + IST_OFFSET)

  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
}

export type CompareAccess = {
  invoices: boolean
  payments: boolean
  expenses: boolean
  purchases: boolean
  orders: boolean
  customers: boolean
}

/**
 * The comparison for a week, month or year: one query per source covering the
 * oldest period the trend needs through the end of the current one (all inside
 * the active company by the tenant-scoped client), bucketed in memory. Metrics
 * the caller may not read are left out.
 */
export async function getCompare(type: PeriodType, access: CompareAccess, now = new Date()) {
  const today = todayInIndia(now)
  const from = fetchFrom(type, today)
  const to = periodEnd(type, periodStart(type, today))
  const between = { gte: from, lte: to }
  const none = Promise.resolve([] as Row[])

  const rowsOf = async <T,>(query: Promise<T[]>, pick: (row: T) => Row) => (await query).map(pick)

  const [invoices, payments, expenses, bills, orders, customers, openBilled, openReceived] = await Promise.all([
    access.invoices
      ? rowsOf(
          prisma.invoice.findMany({
            where: { status: 'ISSUED', invoiceDate: between },
            select: { invoiceDate: true, total: true },
          }),
          (row) => ({ date: row.invoiceDate, value: num(row.total) }),
        )
      : none,
    access.payments
      ? rowsOf(
          prisma.payment.findMany({ where: { paidOn: between }, select: { paidOn: true, amount: true } }),
          (row) => ({ date: row.paidOn, value: num(row.amount) }),
        )
      : none,
    access.expenses
      ? rowsOf(
          prisma.expense.findMany({ where: { expenseDate: between }, select: { expenseDate: true, total: true } }),
          (row) => ({ date: row.expenseDate, value: num(row.total) }),
        )
      : none,
    access.purchases
      ? rowsOf(
          prisma.purchaseBill.findMany({
            where: { status: 'POSTED', billDate: between },
            select: { billDate: true, total: true },
          }),
          (row) => ({ date: row.billDate, value: num(row.total) }),
        )
      : none,
    access.orders
      ? rowsOf(
          prisma.order.findMany({
            where: { status: { not: 'CANCELLED' }, orderDate: between },
            select: { orderDate: true },
          }),
          (row) => ({ date: row.orderDate, value: 1 }),
        )
      : none,
    access.customers
      ? rowsOf(
          prisma.customer.findMany({
            // A day of slack either side of the window: createdAt is an instant, the window is India days.
            where: { createdAt: { gte: new Date(from.getTime() - 86_400_000), lte: new Date(to.getTime() + 2 * 86_400_000) } },
            select: { createdAt: true },
          }),
          (row) => ({ date: indiaDay(row.createdAt), value: 1 }),
        )
      : none,
    access.invoices
      ? prisma.invoice.aggregate({ where: { status: 'ISSUED', invoiceDate: { lt: from } }, _sum: { total: true } })
      : null,
    access.invoices && access.payments
      ? prisma.payment.aggregate({ where: { paidOn: { lt: from } }, _sum: { amount: true } })
      : null,
  ])

  const data: Partial<Record<MetricKey, MetricRows>> = {}

  if (access.invoices) {
    data.sales = { rows: invoices }
    data.invoices = { rows: invoices.map((row) => ({ date: row.date, value: 1 })) }
  }

  if (access.payments) data.collections = { rows: payments }
  if (access.expenses) data.expenses = { rows: expenses }
  if (access.purchases) data.purchases = { rows: bills }
  if (access.orders) data.orders = { rows: orders }
  if (access.customers) data.newCustomers = { rows: customers }

  if (access.payments && access.expenses) {
    data.profit = { rows: [...payments, ...expenses.map((row) => ({ date: row.date, value: -row.value }))] }
  }

  if (access.invoices && access.payments) {
    data.receivables = {
      rows: [...invoices, ...payments.map((row) => ({ date: row.date, value: -row.value }))],
      opening: num(openBilled?._sum.total) - num(openReceived?._sum.amount),
    }
  }

  return buildCompare(type, today, data)
}
