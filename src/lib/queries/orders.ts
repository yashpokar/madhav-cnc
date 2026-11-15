import type { OrderImpact } from '@/lib/order-delete'
import { prisma } from '@/lib/prisma'
import type { OrderStatus } from '@/generated/prisma/enums'
import { summariseMaterial } from '@/lib/queries/quotations'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

function optionalNum(value: DecimalLike | null): number | null {
  return value === null ? null : value.toNumber()
}

export function countOrders() {
  return prisma.order.count()
}

export async function listOrders({
  search,
  status,
}: {
  search?: string
  status?: OrderStatus
} = {}) {
  const term = search?.trim()

  const orders = await prisma.order.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { subject: { contains: term, mode: 'insensitive' } },
              { customerPoNumber: { contains: term, mode: 'insensitive' } },
              { customer: { name: { contains: term, mode: 'insensitive' } } },
              { customer: { phone: { contains: term } } },
              { architect: { name: { contains: term, mode: 'insensitive' } } },
              { quotation: { number: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      status: true,
      subject: true,
      orderDate: true,
      dueDate: true,
      total: true,
      advanceAmount: true,
      customer: { select: { id: true, code: true, name: true } },
      architect: { select: { name: true } },
      quotation: { select: { id: true, number: true } },
      lines: { select: { materialSupply: true } },
      invoices: { select: { number: true } },
      dispatches: { select: { number: true } },
      advancePayment: { select: { number: true, amount: true } },
      _count: { select: { lines: true, productionTasks: true, expenses: true } },
    },
  })

  return orders.map(({ lines, invoices, dispatches, advancePayment, ...order }) => ({
    ...order,
    total: num(order.total),
    advanceAmount: num(order.advanceAmount),
    materialSummary: summariseMaterial(lines),
    impact: {
      lines: order._count.lines,
      tasks: order._count.productionTasks,
      invoices: invoices.map((row) => row.number),
      dispatches: dispatches.map((row) => row.number),
      expenses: order._count.expenses,
      advance: advancePayment
        ? { number: advancePayment.number, amount: num(advancePayment.amount) }
        : null,
      quotation: order.quotation?.number ?? null,
    } satisfies OrderImpact,
  }))
}

export async function getOrder(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      architect: { select: { id: true, code: true, name: true, phone: true } },
      carpenter: { select: { id: true, code: true, name: true, phone: true } },
      quotation: { select: { id: true, number: true, revision: true } },
      createdBy: { select: { name: true } },
      lines: { orderBy: { position: 'asc' } },
      advancePayment: { select: { id: true, mode: true, channelId: true } },
    },
  })

  if (!order) {
    return null
  }

  return {
    ...order,
    discountValue: num(order.discountValue),
    subtotal: num(order.subtotal),
    discountAmount: num(order.discountAmount),
    taxableAmount: num(order.taxableAmount),
    taxAmount: num(order.taxAmount),
    roundOff: num(order.roundOff),
    total: num(order.total),
    advanceAmount: num(order.advanceAmount),
    transportCharge: num(order.transportCharge),
    transportTaxRatePercent: num(order.transportTaxRatePercent),
    lines: order.lines.map((line) => ({
      ...line,
      length: optionalNum(line.length),
      width: optionalNum(line.width),
      pieces: optionalNum(line.pieces),
      quantity: num(line.quantity),
      rate: num(line.rate),
      discountPercent: num(line.discountPercent),
      taxRatePercent: num(line.taxRatePercent),
      amount: num(line.amount),
      taxAmount: num(line.taxAmount),
      lineTotal: num(line.lineTotal),
    })),
  }
}

export type OrderListItem = Awaited<ReturnType<typeof listOrders>>[number]
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>

/** What deleting this order would touch; see describeOrderDelete. */
export async function getOrderImpact(id: string): Promise<OrderImpact | null> {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      quotation: { select: { number: true } },
      invoices: { select: { number: true } },
      dispatches: { select: { number: true } },
      advancePayment: { select: { number: true, amount: true } },
      _count: { select: { lines: true, productionTasks: true, expenses: true } },
    },
  })

  if (!order) return null

  return {
    lines: order._count.lines,
    tasks: order._count.productionTasks,
    invoices: order.invoices.map((row) => row.number),
    dispatches: order.dispatches.map((row) => row.number),
    expenses: order._count.expenses,
    advance: order.advancePayment
      ? { number: order.advancePayment.number, amount: order.advancePayment.amount.toNumber() }
      : null,
    quotation: order.quotation?.number ?? null,
  }
}
