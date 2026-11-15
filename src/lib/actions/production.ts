'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { companyMemberWhere } from '@/lib/tenant'
import { requireCapability } from '@/lib/session'
import { logActivity } from '@/lib/activity'
import type { SimpleResult } from '@/lib/actions/quotations'
import {
  OrderStatus,
  ProductionTaskStatus,
} from '@/generated/prisma/enums'
import {
  blockingTask,
  followingTask,
  reasonNote,
  reopenCheck,
  startNeedsForce,
} from '@/lib/production-rules'

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

type Db = Pick<typeof prisma, 'order' | 'productionTask'>

async function syncOrderFromStages(orderId: string, db: Db = prisma) {
  const [order, tasks] = await Promise.all([
    db.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    }),
    db.productionTask.findMany({
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

  await db.order.update({
    where: { id: orderId },
    data: { status: furthest },
  })

  return furthest
}

/**
 * The opposite of syncOrderFromStages, used when a finished stage is reopened:
 * the order falls back to the furthest status still reached by a finished
 * stage (never below IN_PRODUCTION). Only called for orders that are
 * IN_PRODUCTION or READY (see reopenCheck).
 */
async function retreatOrderFromStages(orderId: string, db: Db) {
  const [order, tasks] = await Promise.all([
    db.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    }),
    db.productionTask.findMany({
      where: { orderId },
      select: { status: true, stage: { select: { linkedStatus: true } } },
    }),
  ])

  if (!order) {
    return null
  }

  const reached = tasks
    .filter((task) => FINISHED.includes(task.status) && task.stage.linkedStatus)
    .map((task) => task.stage.linkedStatus as OrderStatus)

  let target: OrderStatus = 'IN_PRODUCTION'

  for (const status of reached) {
    if (rank(status) > rank(target)) {
      target = status
    }
  }

  if (rank(order.status) <= rank(target)) {
    return null
  }

  await db.order.update({ where: { id: orderId }, data: { status: target } })

  return target
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

  const stageName = task.stage.name

  const verbs: Record<ProductionTaskStatus, string> = {
    PENDING: 'moved back to pending',
    IN_PROGRESS: 'started',
    ON_HOLD: 'put on hold',
    DONE: 'completed',
    SKIPPED: 'skipped',
  }

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: moved
      ? `${verbs[status]} ${stageName}; the order is now ${moved.toLowerCase().replace('_', ' ')}`
      : `${verbs[status]} ${stageName}`,
    actor: { id: user.id, name: user.name },
  })

  revalidateFor(task.orderId)

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
  const user = await requireCapability('production:update')

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: { orderId: true, stage: { select: { name: true } } },
  })

  if (!task) {
    return { ok: false, error: 'Task not found' }
  }

  // User is a global table: only someone who works in this company may be assigned.
  const assignee = userId
    ? await prisma.user.findFirst({
        where: {
          AND: [companyMemberWhere(await requireCompanyId()), { id: userId }],
        },
        select: { name: true },
      })
    : null

  if (userId && !assignee) {
    return { ok: false, error: 'That person is not part of this company' }
  }

  await prisma.productionTask.update({
    where: { id: taskId },
    data: { assignedToId: userId },
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: assignee
      ? `assigned ${task.stage.name} to ${assignee.name}`
      : `cleared the assignment on ${task.stage.name}`,
    actor: { id: user.id, name: user.name },
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

  if (order.status === 'CONFIRMED' || created > 0) {
    await logActivity({
      entity: 'order',
      id: orderId,
      action: 'status',
      summary: `started production with ${created} stage${created === 1 ? '' : 's'}`,
      actor: { id: user.id, name: user.name },
    })
  }

  revalidateFor(orderId)

  return {
    ok: true,
    message: `${order.number} is in production with ${created} stage${created === 1 ? '' : 's'}`,
  }
}

// ---------------------------------------------------------------------------
// Workflow actions: sequenced start, complete-and-advance, hold, skip, reopen.
// setTaskStatus above stays as the low-level, unsequenced mutation.
// ---------------------------------------------------------------------------

const taskSelect = {
  id: true,
  orderId: true,
  status: true,
  position: true,
  startedAt: true,
  completedAt: true,
  notes: true,
  assignedToId: true,
  stage: { select: { name: true } },
  order: { select: { number: true, status: true } },
} as const

function pretty(status: string) {
  return status.toLowerCase().replace('_', ' ')
}

async function siblings(orderId: string) {
  return prisma.productionTask.findMany({
    where: { orderId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      status: true,
      startedAt: true,
      completedAt: true,
      stage: { select: { name: true } },
    },
  })
}

/**
 * Starts (or resumes) a stage. The stage must be the next one in line unless
 * an admin passes `force` ("Start anyway").
 */
export async function startTask(
  taskId: string,
  options: { force?: boolean } = {},
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: taskSelect,
  })

  if (!task) {
    return { ok: false, error: 'Stage not found' }
  }

  if (task.order.status === 'CANCELLED') {
    return { ok: false, error: 'This order has been cancelled' }
  }

  if (task.status !== 'PENDING' && task.status !== 'ON_HOLD') {
    return { ok: false, error: `${task.stage.name} is already ${pretty(task.status)}` }
  }

  const all = await siblings(task.orderId)
  const blocker = blockingTask(all, taskId)
  const outOfOrder = startNeedsForce(all, taskId)

  if (outOfOrder) {
    if (!options.force) {
      return {
        ok: false,
        error: `${task.stage.name} is waiting for ${blocker?.stage.name ?? 'an earlier stage'}`,
      }
    }

    if (user.role !== 'ADMIN') {
      return { ok: false, error: 'Only an admin can start a stage out of order' }
    }
  }

  const resumed = task.status === 'ON_HOLD'

  const moved = await prisma.$transaction(async (tx) => {
    await tx.productionTask.update({
      where: { id: taskId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: task.startedAt ?? new Date(),
        completedAt: null,
        completedById: null,
        assignedToId: task.assignedToId ?? user.id,
      },
    })

    return syncOrderFromStages(task.orderId, tx)
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `${resumed ? 'resumed' : 'started'} ${task.stage.name}${outOfOrder ? ' out of order' : ''}${moved ? `; the order is now ${pretty(moved)}` : ''}`,
    actor: { id: user.id, name: user.name },
  })

  revalidateFor(task.orderId)

  return {
    ok: true,
    message: `${task.stage.name} ${resumed ? 'resumed' : 'started'}`,
  }
}

/**
 * Finishes an in-progress stage and, by default, starts the next pending one,
 * in one transaction. The order status follows the stage link exactly as
 * setTaskStatus does.
 */
export async function completeTask(
  taskId: string,
  options: { startNext?: boolean } = {},
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')
  const startNext = options.startNext ?? true

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: taskSelect,
  })

  if (!task) {
    return { ok: false, error: 'Stage not found' }
  }

  if (task.order.status === 'CANCELLED') {
    return { ok: false, error: 'This order has been cancelled' }
  }

  if (task.status !== 'IN_PROGRESS') {
    return { ok: false, error: `${task.stage.name} is not in progress` }
  }

  const all = await siblings(task.orderId)
  const after = startNext ? followingTask(all, taskId) : null
  const now = new Date()

  const moved = await prisma.$transaction(async (tx) => {
    await tx.productionTask.update({
      where: { id: taskId },
      data: { status: 'DONE', completedAt: now, completedById: user.id },
    })

    if (after) {
      await tx.productionTask.update({
        where: { id: after.id },
        data: { status: 'IN_PROGRESS', startedAt: now, assignedToId: user.id },
      })
    }

    return syncOrderFromStages(task.orderId, tx)
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `completed ${task.stage.name}${after ? ` and started ${after.stage.name}` : ''}${moved ? `; the order is now ${pretty(moved)}` : ''}`,
    actor: { id: user.id, name: user.name },
  })

  revalidateFor(task.orderId)

  const parts = [`${task.stage.name} done`]

  if (after) {
    parts.push(`${after.stage.name} started`)
  }

  if (moved) {
    parts.push(`${task.order.number} is now ${pretty(moved)}`)
  }

  return { ok: true, message: parts.join(' — ') }
}

export async function holdTask(
  taskId: string,
  reason?: string,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: taskSelect,
  })

  if (!task) {
    return { ok: false, error: 'Stage not found' }
  }

  if (task.order.status === 'CANCELLED') {
    return { ok: false, error: 'This order has been cancelled' }
  }

  if (task.status !== 'IN_PROGRESS') {
    return { ok: false, error: 'Only a stage in progress can be put on hold' }
  }

  const clean = reason?.trim().slice(0, 500) || null

  await prisma.productionTask.update({
    where: { id: taskId },
    data: {
      status: 'ON_HOLD',
      notes: reasonNote(task.notes, 'On hold', clean),
    },
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `put ${task.stage.name} on hold${clean ? ` (${clean})` : ''}`,
    actor: { id: user.id, name: user.name },
  })

  revalidateFor(task.orderId)

  return { ok: true, message: `${task.stage.name} put on hold` }
}

export async function skipTask(
  taskId: string,
  reason?: string,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: taskSelect,
  })

  if (!task) {
    return { ok: false, error: 'Stage not found' }
  }

  if (task.order.status === 'CANCELLED') {
    return { ok: false, error: 'This order has been cancelled' }
  }

  if (task.status === 'DONE' || task.status === 'SKIPPED') {
    return { ok: false, error: `${task.stage.name} is already finished` }
  }

  const clean = reason?.trim().slice(0, 500) || null

  const moved = await prisma.$transaction(async (tx) => {
    await tx.productionTask.update({
      where: { id: taskId },
      data: {
        status: 'SKIPPED',
        completedAt: new Date(),
        completedById: user.id,
        notes: reasonNote(task.notes, 'Skipped', clean),
      },
    })

    return syncOrderFromStages(task.orderId, tx)
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `skipped ${task.stage.name}${clean ? ` (${clean})` : ''}${moved ? `; the order is now ${pretty(moved)}` : ''}`,
    actor: { id: user.id, name: user.name },
  })

  revalidateFor(task.orderId)

  return { ok: true, message: `${task.stage.name} skipped` }
}

/**
 * Reopens the latest finished stage (see reopenCheck). The stage goes back to
 * in progress with its finish cleared, and the order falls back to what the
 * remaining finished stages justify.
 */
export async function reopenTask(taskId: string): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: taskSelect,
  })

  if (!task) {
    return { ok: false, error: 'Stage not found' }
  }

  const all = await siblings(task.orderId)
  const check = reopenCheck(all, taskId, task.order.status)

  if (!check.ok) {
    return { ok: false, error: check.reason }
  }

  const moved = await prisma.$transaction(async (tx) => {
    await tx.productionTask.update({
      where: { id: taskId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: task.startedAt ?? new Date(),
        completedAt: null,
        completedById: null,
      },
    })

    return retreatOrderFromStages(task.orderId, tx)
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `reopened ${task.stage.name}${moved ? `; the order is back to ${pretty(moved)}` : ''}`,
    actor: { id: user.id, name: user.name },
  })

  revalidateFor(task.orderId)

  return { ok: true, message: `${task.stage.name} reopened` }
}

export async function saveTaskNotes(
  taskId: string,
  notes: string,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: { orderId: true, notes: true, stage: { select: { name: true } } },
  })

  if (!task) {
    return { ok: false, error: 'Stage not found' }
  }

  const clean = notes.trim().slice(0, 2000) || null

  if (clean === (task.notes?.trim() || null)) {
    return { ok: true, message: 'Notes saved' }
  }

  await prisma.productionTask.update({
    where: { id: taskId },
    data: { notes: clean },
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `updated the notes on ${task.stage.name}`,
    actor: { id: user.id, name: user.name },
  })

  revalidateFor(task.orderId)

  return { ok: true, message: 'Notes saved' }
}
