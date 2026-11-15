// Production stage settings (add, rename, reorder, link to an order status,
// retire, delete), as plain functions with JSON-native input so the web server
// actions and the mobile API share them. No cookies, redirects or revalidation
// here; the adapters do that after a successful result.
//
// Company scope: every function runs inside a company scope (the web's active
// company cookie, or the API's X-Company-Id); stages of other companies are
// invisible, and callers never pass a companyId. The settings:update capability
// is checked by the adapters.

import { prisma } from '@/lib/prisma'
import {
  STAGE_LINKED_STATUSES,
  stageNameSchema,
  type StageLinkedStatus,
} from '@/lib/validation/production'

export type StageResult = { ok: true; message: string } | { ok: false; error: string }

export async function createStage(name: string): Promise<StageResult> {
  const parsed = stageNameSchema.safeParse(name)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const clash = await prisma.productionStage.findFirst({
    where: { name: { equals: parsed.data, mode: 'insensitive' } },
  })

  if (clash) {
    return { ok: false, error: 'A stage with that name already exists' }
  }

  const last = await prisma.productionStage.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  await prisma.productionStage.create({
    data: { name: parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
  })

  return { ok: true, message: `${parsed.data} added` }
}

export async function renameStage(id: string, name: string): Promise<StageResult> {
  const parsed = stageNameSchema.safeParse(name)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const clash = await prisma.productionStage.findFirst({
    where: { name: { equals: parsed.data, mode: 'insensitive' }, id: { not: id } },
  })

  if (clash) {
    return { ok: false, error: 'A stage with that name already exists' }
  }

  const existing = await prisma.productionStage.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!existing) {
    return { ok: false, error: 'Stage not found' }
  }

  await prisma.productionStage.update({
    where: { id },
    data: { name: parsed.data },
  })

  return { ok: true, message: 'Stage renamed' }
}

export async function moveStage(
  id: string,
  direction: 'up' | 'down',
): Promise<StageResult> {
  const stages = await prisma.productionStage.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sortOrder: true },
  })

  const index = stages.findIndex((stage) => stage.id === id)

  if (index === -1) {
    return { ok: false, error: 'Stage not found' }
  }

  const swapWith = direction === 'up' ? index - 1 : index + 1

  if (swapWith < 0 || swapWith >= stages.length) {
    return { ok: false, error: 'Already at the end' }
  }

  await prisma.$transaction([
    prisma.productionStage.update({
      where: { id: stages[index].id },
      data: { sortOrder: swapWith },
    }),
    prisma.productionStage.update({
      where: { id: stages[swapWith].id },
      data: { sortOrder: index },
    }),
  ])

  return { ok: true, message: 'Order updated' }
}

export async function setStageStatus(
  id: string,
  linkedStatus: string | null,
): Promise<StageResult> {
  if (
    linkedStatus !== null &&
    !(STAGE_LINKED_STATUSES as readonly string[]).includes(linkedStatus)
  ) {
    return { ok: false, error: 'Unknown status' }
  }

  const existing = await prisma.productionStage.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!existing) {
    return { ok: false, error: 'Stage not found' }
  }

  await prisma.productionStage.update({
    where: { id },
    data: { linkedStatus: linkedStatus as StageLinkedStatus | null },
  })

  return {
    ok: true,
    message: linkedStatus
      ? 'Stage will move the order on completion'
      : 'Stage no longer changes the order status',
  }
}

export async function setStageActive(
  id: string,
  isActive: boolean,
): Promise<StageResult> {
  const inUse = await prisma.productionTask.count({
    where: { stageId: id, status: { in: ['PENDING', 'IN_PROGRESS', 'ON_HOLD'] } },
  })

  if (!isActive && inUse > 0) {
    return {
      ok: false,
      error: `${inUse} open task${inUse === 1 ? '' : 's'} still sit in this stage`,
    }
  }

  const existing = await prisma.productionStage.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!existing) {
    return { ok: false, error: 'Stage not found' }
  }

  await prisma.productionStage.update({
    where: { id },
    data: { isActive },
  })

  return { ok: true, message: isActive ? 'Stage enabled' : 'Stage retired' }
}

export async function deleteStage(id: string): Promise<StageResult> {
  const stage = await prisma.productionStage.findUnique({
    where: { id },
    select: { name: true },
  })

  if (!stage) {
    return { ok: false, error: 'Stage not found' }
  }

  const tasks = await prisma.productionTask.count({ where: { stageId: id } })

  if (tasks > 0) {
    return {
      ok: false,
      error: `${stage.name} has ${tasks} production task(s) on record. Retire it instead.`,
    }
  }

  await prisma.productionStage.delete({ where: { id } })

  return { ok: true, message: `${stage.name} deleted` }
}
