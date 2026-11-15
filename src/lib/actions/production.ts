'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'
import type { ProductionTaskStatus } from '@/generated/prisma/enums'
import * as production from '@/lib/services/production'
import type { ProductionActor, ServiceResult } from '@/lib/services/production'

export type { SimpleResult }

/**
 * Thin adapters over src/lib/services/production.ts: they check the
 * capability, call the service and refresh the pages it touched.
 */

function revalidateFor(orderId: string) {
  revalidatePath('/production')
  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
}

function finish(result: ServiceResult): SimpleResult {
  if (!result.ok) {
    return result
  }

  if (result.orderId) {
    revalidateFor(result.orderId)
  }

  return { ok: true, message: result.message }
}

const actorOf = (user: { id: string; name: string; role: string }): ProductionActor => ({
  id: user.id,
  name: user.name,
  role: user.role,
})

export async function ensureTasksForOrder(orderId: string) {
  return production.ensureTasksForOrder(orderId)
}

export async function setTaskStatus(
  taskId: string,
  status: ProductionTaskStatus,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  return finish(await production.setTaskStatus(actorOf(user), taskId, status))
}

export async function assignTask(
  taskId: string,
  userId: string | null,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  return finish(await production.assignTask(actorOf(user), taskId, userId))
}

export async function startProduction(orderId: string): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  return finish(await production.startProduction(actorOf(user), orderId))
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

  return finish(await production.startTask(actorOf(user), taskId, options))
}

/** Finishes an in-progress stage and, by default, starts the next pending one. */
export async function completeTask(
  taskId: string,
  options: { startNext?: boolean } = {},
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  return finish(await production.completeTask(actorOf(user), taskId, options))
}

export async function holdTask(
  taskId: string,
  reason?: string,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  return finish(await production.holdTask(actorOf(user), taskId, reason))
}

export async function skipTask(
  taskId: string,
  reason?: string,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  return finish(await production.skipTask(actorOf(user), taskId, reason))
}

/** Reopens the latest finished stage (see reopenCheck). */
export async function reopenTask(taskId: string): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  return finish(await production.reopenTask(actorOf(user), taskId))
}

export async function saveTaskNotes(
  taskId: string,
  notes: string,
): Promise<SimpleResult> {
  const user = await requireCapability('production:update')

  return finish(await production.saveTaskNotes(actorOf(user), taskId, notes))
}
