// Production workflow writes (stages of an order's work, starting, finishing,
// holding, skipping and reopening them), as plain functions that take the
// acting user and JSON-native input, so the web server actions and the mobile
// API run the very same code. No cookies, headers, redirects or cache
// revalidation in here: the adapters do that, using the `orderId` that every
// successful result carries.
//
// Company scope: every function runs inside a company scope (the web's active
// company cookie, or the API's X-Company-Id). Rows are filtered to that company
// automatically, so callers never pass a companyId and a task or order from
// another company simply is "not found". Permission checks (production:update)
// stay in the adapters; the state rules (cancelled order, stage sequence,
// admin-only force) are re-checked here.
//
// Every multi-row change, and the order-status sync that follows a stage
// change, happens in one transaction. Activity is logged here so web and API
// both leave a trail.

import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'
import { companyMemberWhere } from '@/lib/tenant'
import { logActivity } from '@/lib/activity'
import type { OrderStatus, ProductionTaskStatus } from '@/generated/prisma/enums'
import {
  advanceTarget,
  blockingTask,
  followingTask,
  prettyStatus,
  reasonNote,
  reopenCheck,
  retreatTarget,
  startNeedsForce,
} from '@/lib/production-rules'

export type ProductionActor = {
  id: string
  name: string
  /** The role in the active company; only ADMIN may start a stage out of order. */
  role?: string
}

export type ServiceResult =
  | {
      ok: true
      message: string
      /** The order the change belongs to, for cache revalidation by the caller. Absent when nothing changed. */
      orderId?: string
    }
  | { ok: false; error: string }

type Db = Pick<typeof prisma, 'order' | 'productionTask'>

const actorLog = (actor: ProductionActor) => ({ id: actor.id, name: actor.name })

/**
 * Creates the missing tasks (one per active stage) for an order and returns
 * how many were added. Pass a transaction client to run inside the caller's
 * transaction.
 */
export async function ensureTasksForOrder(orderId: string, db: Pick<typeof prisma, 'productionStage' | 'productionTask'> = prisma) {
  const stages = await db.productionStage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  })

  if (stages.length === 0) {
    return 0
  }

  const existing = await db.productionTask.findMany({
    where: { orderId },
    select: { stageId: true },
  })
  const have = new Set(existing.map((task) => task.stageId))
  const missing = stages.filter((stage) => !have.has(stage.id))

  if (missing.length === 0) {
    return 0
  }

  await db.productionTask.createMany({
    data: missing.map((stage) => ({
      orderId,
      stageId: stage.id,
      position: stages.findIndex((entry) => entry.id === stage.id) + 1,
    })),
  })

  return missing.length
}

/**
 * Moves the order forward to the furthest status reached by a finished stage
 * (see advanceTarget). Pass the transaction client so the task change and the
 * order change commit together. Returns the new status, or null if unchanged.
 */
export async function syncOrderFromStages(orderId: string, db: Db = prisma) {
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

  if (!order) {
    return null
  }

  const target = advanceTarget(order.status, tasks)

  if (!target) {
    return null
  }

  await db.order.update({
    where: { id: orderId },
    data: { status: target },
  })

  return target as OrderStatus
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

  const target = retreatTarget(order.status, tasks)

  if (!target) {
    return null
  }

  await db.order.update({ where: { id: orderId }, data: { status: target } })

  return target as OrderStatus
}

/**
 * Low-level, unsequenced status change of one task (kept for scripts and the
 * `setTaskStatus` action; the workflow functions below are what the UI uses).
 */
export async function setTaskStatus(
  actor: ProductionActor,
  taskId: string,
  status: ProductionTaskStatus,
): Promise<ServiceResult> {
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

  const moved = await prisma.$transaction(async (tx) => {
    await tx.productionTask.update({
      where: { id: taskId },
      data: {
        status,
        startedAt:
          status === 'IN_PROGRESS' && !task.startedAt ? now : task.startedAt,
        completedAt: status === 'DONE' ? now : null,
        completedById: status === 'DONE' ? actor.id : null,
        assignedToId: status === 'IN_PROGRESS' ? actor.id : undefined,
      },
    })

    return syncOrderFromStages(task.orderId, tx)
  })

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
      ? `${verbs[status]} ${stageName}; the order is now ${prettyStatus(moved)}`
      : `${verbs[status]} ${stageName}`,
    actor: actorLog(actor),
  })

  if (moved) {
    return {
      ok: true,
      orderId: task.orderId,
      message: `${stageName} done — ${task.order.number} is now ${prettyStatus(moved)}`,
    }
  }

  return {
    ok: true,
    orderId: task.orderId,
    message: `${stageName} marked ${prettyStatus(status)}`,
  }
}

export async function assignTask(
  actor: ProductionActor,
  taskId: string,
  userId: string | null,
): Promise<ServiceResult> {
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
    actor: actorLog(actor),
  })

  return {
    ok: true,
    orderId: task.orderId,
    message: userId ? 'Assigned' : 'Assignment cleared',
  }
}

/** Puts a confirmed order into production, creating a task per active stage. */
export async function startProduction(
  actor: ProductionActor,
  orderId: string,
): Promise<ServiceResult> {
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
      data: { status: 'IN_PRODUCTION', updatedById: actor.id },
    })
  }

  if (order.status === 'CONFIRMED' || created > 0) {
    await logActivity({
      entity: 'order',
      id: orderId,
      action: 'status',
      summary: `started production with ${created} stage${created === 1 ? '' : 's'}`,
      actor: actorLog(actor),
    })
  }

  return {
    ok: true,
    orderId,
    message: `${order.number} is in production with ${created} stage${created === 1 ? '' : 's'}`,
  }
}

// ---------------------------------------------------------------------------
// Workflow functions: sequenced start, complete-and-advance, hold, skip, reopen.
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
  actor: ProductionActor,
  taskId: string,
  options: { force?: boolean } = {},
): Promise<ServiceResult> {
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
    return { ok: false, error: `${task.stage.name} is already ${prettyStatus(task.status)}` }
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

    if (actor.role !== 'ADMIN') {
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
        assignedToId: task.assignedToId ?? actor.id,
      },
    })

    return syncOrderFromStages(task.orderId, tx)
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `${resumed ? 'resumed' : 'started'} ${task.stage.name}${outOfOrder ? ' out of order' : ''}${moved ? `; the order is now ${prettyStatus(moved)}` : ''}`,
    actor: actorLog(actor),
  })

  return {
    ok: true,
    orderId: task.orderId,
    message: `${task.stage.name} ${resumed ? 'resumed' : 'started'}`,
  }
}

/**
 * Finishes an in-progress stage and, by default, starts the next pending one,
 * in one transaction. The order status follows the stage link exactly as
 * setTaskStatus does.
 */
export async function completeTask(
  actor: ProductionActor,
  taskId: string,
  options: { startNext?: boolean } = {},
): Promise<ServiceResult> {
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
      data: { status: 'DONE', completedAt: now, completedById: actor.id },
    })

    if (after) {
      await tx.productionTask.update({
        where: { id: after.id },
        data: { status: 'IN_PROGRESS', startedAt: now, assignedToId: actor.id },
      })
    }

    return syncOrderFromStages(task.orderId, tx)
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `completed ${task.stage.name}${after ? ` and started ${after.stage.name}` : ''}${moved ? `; the order is now ${prettyStatus(moved)}` : ''}`,
    actor: actorLog(actor),
  })

  const parts = [`${task.stage.name} done`]

  if (after) {
    parts.push(`${after.stage.name} started`)
  }

  if (moved) {
    parts.push(`${task.order.number} is now ${prettyStatus(moved)}`)
  }

  return { ok: true, orderId: task.orderId, message: parts.join(' — ') }
}

export async function holdTask(
  actor: ProductionActor,
  taskId: string,
  reason?: string,
): Promise<ServiceResult> {
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
    actor: actorLog(actor),
  })

  return { ok: true, orderId: task.orderId, message: `${task.stage.name} put on hold` }
}

export async function skipTask(
  actor: ProductionActor,
  taskId: string,
  reason?: string,
): Promise<ServiceResult> {
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
        completedById: actor.id,
        notes: reasonNote(task.notes, 'Skipped', clean),
      },
    })

    return syncOrderFromStages(task.orderId, tx)
  })

  await logActivity({
    entity: 'order',
    id: task.orderId,
    action: 'production',
    summary: `skipped ${task.stage.name}${clean ? ` (${clean})` : ''}${moved ? `; the order is now ${prettyStatus(moved)}` : ''}`,
    actor: actorLog(actor),
  })

  return { ok: true, orderId: task.orderId, message: `${task.stage.name} skipped` }
}

/**
 * Reopens the latest finished stage (see reopenCheck). The stage goes back to
 * in progress with its finish cleared, and the order falls back to what the
 * remaining finished stages justify.
 */
export async function reopenTask(
  actor: ProductionActor,
  taskId: string,
): Promise<ServiceResult> {
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
    summary: `reopened ${task.stage.name}${moved ? `; the order is back to ${prettyStatus(moved)}` : ''}`,
    actor: actorLog(actor),
  })

  return { ok: true, orderId: task.orderId, message: `${task.stage.name} reopened` }
}

export async function saveTaskNotes(
  actor: ProductionActor,
  taskId: string,
  notes: string,
): Promise<ServiceResult> {
  const task = await prisma.productionTask.findUnique({
    where: { id: taskId },
    select: { orderId: true, notes: true, stage: { select: { name: true } } },
  })

  if (!task) {
    return { ok: false, error: 'Stage not found' }
  }

  const clean = notes.trim().slice(0, 2000) || null

  if (clean === (task.notes?.trim() || null)) {
    // Nothing changed, so there is nothing to refresh.
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
    actor: actorLog(actor),
  })

  return { ok: true, orderId: task.orderId, message: 'Notes saved' }
}
