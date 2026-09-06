'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'
import {
  OrderStatus,
  ProductionTaskStatus,
} from '@/generated/prisma/enums'

export type { SimpleResult }

export async function ensureTasksForOrder(orderId: string) {
  const stages = await prisma.productionStage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  })

  if (stages.length === 0) {
    return 0
  }

  const existing = await prisma.productionTask.findMany({
    where: { orderId },
    select: { stageId: true },
  })
  const have = new Set(existing.map((task) => task.stageId))
  const missing = stages.filter((stage) => !have.has(stage.id))

  if (missing.length === 0) {
    return 0
  }

  await prisma.productionTask.createMany({
    data: missing.map((stage) => ({
      orderId,
      stageId: stage.id,
      position: stages.findIndex((entry) => entry.id === stage.id) + 1,
    })),
  })

  return missing.length
}

const FINISHED: ProductionTaskStatus[] = ['DONE', 'SKIPPED']

const STATUS_ORDER: OrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DISPATCHED',
  'COMPLETED',
]

function rank(status: OrderStatus) {
  const index = STATUS_ORDER.indexOf(status)
  return index === -1 ? -1 : index
}

async function syncOrderFromStages(orderId: string) {
  const [order, tasks] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    }),
    prisma.productionTask.findMany({
      where: { orderId },
      orderBy: { position: 'asc' },
      select: {
        status: true,
        stage: { select: { linkedStatus: true } },
      },
    }),
  ])

  if (!order || tasks.length === 0 || order.status === 'CANCELLED') {
    return null
  }

  const reached = tasks
    .filter(
      (task) => FINISHED.includes(task.status) && task.stage.linkedStatus,
    )
    .map((task) => task.stage.linkedStatus as OrderStatus)

  if (reached.length === 0) {
    return null
  }

  const furthest = reached.reduce((best, status) =>
    rank(status) > rank(best) ? status : best,
  )

  if (rank(furthest) <= rank(order.status)) {
    return null
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: furthest },
  })

  return furthest
}

function revalidateFor(orderId: string) {
  revalidatePath('/production')
  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
}

export async function setTaskStatus(
  taskId: string,
  status: ProductionTaskStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      orderId: true,
      status: true,
      startedAt: true,
      stage: { select: { name: true } },
      order: { select: { number: true, status: true } },
    },
  })

  if (!task) {
    return { ok: false, error: 'Task not found' }
  }

  if (task.order.status === 'CANCELLED') {
    return { ok: false, error: 'This order has been cancelled' }
  }

  const now = new Date()

  await prisma.productionTask.update({
    where: { id: taskId },
    data: {
      status,
      startedAt:
        status === 'IN_PROGRESS' && !task.startedAt ? now : task.startedAt,
      completedAt: status === 'DONE' ? now : null,
      completedById: status === 'DONE' ? user.id : null,
      assignedToId: status === 'IN_PROGRESS' ? user.id : undefined,
    },
  })

  const moved = await syncOrderFromStages(task.orderId)

  revalidateFor(task.orderId)

  const stageName = task.stage.name

  if (moved) {
    return {
      ok: true,
      message: `${stageName} done — ${task.order.number} is now ${moved.toLowerCase().replace('_', ' ')}`,
    }
  }

  return { ok: true, message: `${stageName} marked ${status.toLowerCase().replace('_', ' ')}` }
}

export async function assignTask(
  taskId: string,
  userId: string | null,
): Promise<SimpleResult> {
  await requireCapability('production:update')

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: { orderId: true },
  })

  if (!task) {
    return { ok: false, error: 'Task not found' }
  }

  await prisma.productionTask.update({
    where: { id: taskId },
    data: { assignedToId: userId },
  })

  revalidateFor(task.orderId)

  return { ok: true, message: userId ? 'Assigned' : 'Assignment cleared' }
}

export async function startProduction(orderId: string): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, number: true },
  })

  if (!order) {
    return { ok: false, error: 'Order not found' }
  }

  if (order.status !== 'CONFIRMED' && order.status !== 'IN_PRODUCTION') {
    return {
      ok: false,
      error: 'Only a confirmed order can be put into production',
    }
  }

  const created = await ensureTasksForOrder(orderId)

  if (order.status === 'CONFIRMED') {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'IN_PRODUCTION', updatedById: user.id },
    })
  }

  revalidateFor(orderId)

  return {
    ok: true,
    message: `${order.number} is in production with ${created} stage${created === 1 ? '' : 's'}`,
  }
}
