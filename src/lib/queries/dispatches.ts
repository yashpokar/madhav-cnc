import { prisma } from '@/lib/prisma'
import type { DispatchStatus } from '@/generated/prisma/enums'

type DecimalLike = { toNumber: () => number }

function num(value: DecimalLike): number {
  return value.toNumber()
}

const COUNTS_AS_SENT: DispatchStatus[] = ['DRAFT', 'DISPATCHED', 'DELIVERED']

export async function listDispatches({
  search,
  status,
}: {
  search?: string
  status?: DispatchStatus
} = {}) {
  const term = search?.trim()

  return prisma.dispatch.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { vehicleNumber: { contains: term, mode: 'insensitive' } },
              { lrNumber: { contains: term, mode: 'insensitive' } },
              { order: { number: { contains: term, mode: 'insensitive' } } },
              {
                order: {
                  customer: { name: { contains: term, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      status: true,
      dispatchDate: true,
      vehicleNumber: true,
      receivedByName: true,
      receivedAt: true,
      order: {
        select: {
          id: true,
          number: true,
          customer: { select: { name: true } },
        },
      },
      _count: { select: { lines: true } },
    },
  })
}

export async function getDispatch(id: string) {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          number: true,
          subject: true,
          customer: {
            select: { name: true, phone: true, address: true, city: true },
          },
        },
      },
      createdBy: { select: { name: true } },
      lines: { orderBy: { position: 'asc' } },
    },
  })

  if (!dispatch) {
    return null
  }

  return {
    ...dispatch,
    lines: dispatch.lines.map((line) => ({
      ...line,
      quantity: num(line.quantity),
    })),
  }
}

export async function getOrderForDispatch(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      siteAddress: true,
      siteCity: true,
      sitePincode: true,
      customer: { select: { name: true, phone: true } },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          description: true,
          unit: true,
          quantity: true,
          dispatchLines: {
            where: { dispatch: { status: { in: COUNTS_AS_SENT } } },
            select: { quantity: true },
          },
        },
      },
    },
  })

  if (!order) {
    return null
  }

  return {
    ...order,
    lines: order.lines.map((line) => {
      const ordered = num(line.quantity)
      const dispatched = line.dispatchLines.reduce(
        (sum, entry) => sum + num(entry.quantity),
        0,
      )

      return {
        id: line.id,
        position: line.position,
        description: line.description,
        unit: line.unit,
        ordered,
        dispatched: Math.round(dispatched * 1000) / 1000,
        remaining: Math.round((ordered - dispatched) * 1000) / 1000,
      }
    }),
  }
}

export async function listDispatchableOrders() {
  return prisma.order.findMany({
    where: { status: { in: ['READY', 'IN_PRODUCTION', 'DISPATCHED'] } },
    orderBy: { orderDate: 'desc' },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      dueDate: true,
      customer: { select: { name: true } },
    },
  })
}

export type DispatchListItem = Awaited<ReturnType<typeof listDispatches>>[number]
export type DispatchDetail = NonNullable<Awaited<ReturnType<typeof getDispatch>>>
export type DispatchableOrder = NonNullable<
  Awaited<ReturnType<typeof getOrderForDispatch>>
>
export type DispatchableLine = DispatchableOrder['lines'][number]
