import { prisma } from '@/lib/prisma'
import type { OrderStatus } from '@/generated/prisma/enums'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

function optionalNum(value: DecimalLike | null): number | null {
  return value === null ? null : value.toNumber()
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
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      status: true,
      materialSupply: true,
      subject: true,
      orderDate: true,
      dueDate: true,
      total: true,
      advanceAmount: true,
      customer: { select: { id: true, code: true, name: true } },
      architect: { select: { name: true } },
      quotation: { select: { id: true, number: true } },
      _count: { select: { lines: true } },
    },
  })

  return orders.map((order) => ({
    ...order,
    total: num(order.total),
    advanceAmount: num(order.advanceAmount),
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
