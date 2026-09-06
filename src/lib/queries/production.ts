import { prisma } from '@/lib/prisma'

const ACTIVE_ORDER_STATUSES = ['IN_PRODUCTION', 'READY'] as const

export async function listStages() {
  return prisma.productionStage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true },
  })
}

export async function listBoardTasks({ search }: { search?: string } = {}) {
  const term = search?.trim()

  return prisma.productionTask.findMany({
    where: {
      order: {
        status: { in: [...ACTIVE_ORDER_STATUSES] },
        ...(term
          ? {
              OR: [
                { number: { contains: term, mode: 'insensitive' } },
                { subject: { contains: term, mode: 'insensitive' } },
                { customer: { name: { contains: term, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
    },
    orderBy: [{ order: { dueDate: 'asc' } }, { position: 'asc' }],
    select: {
      id: true,
      status: true,
      position: true,
      startedAt: true,
      completedAt: true,
      notes: true,
      stage: { select: { id: true, name: true, sortOrder: true } },
      assignedTo: { select: { id: true, name: true } },
      order: {
        select: {
          id: true,
          number: true,
          subject: true,
          dueDate: true,
          lines: { select: { materialSupply: true } },
          customer: { select: { name: true } },
        },
      },
    },
  })
}

export async function listTasksForOrder(orderId: string) {
  return prisma.productionTask.findMany({
    where: { orderId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      status: true,
      position: true,
      startedAt: true,
      completedAt: true,
      notes: true,
      stage: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      completedBy: { select: { name: true } },
    },
  })
}

export async function listOperators() {
  return prisma.user.findMany({
    where: { isActive: true, role: { in: ['OPERATOR', 'ADMIN'] } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}

export type BoardTask = Awaited<ReturnType<typeof listBoardTasks>>[number]
export type OrderTask = Awaited<ReturnType<typeof listTasksForOrder>>[number]
export type StageOption = Awaited<ReturnType<typeof listStages>>[number]
export type OperatorOption = Awaited<ReturnType<typeof listOperators>>[number]
