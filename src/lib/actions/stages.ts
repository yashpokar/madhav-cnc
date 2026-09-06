'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

const nameSchema = z.string().trim().min(1, 'Stage name is required').max(60)

export async function createStage(name: string): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const parsed = nameSchema.safeParse(name)

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

  revalidatePath('/production')
  revalidatePath('/production/stages')

  return { ok: true, message: `${parsed.data} added` }
}

export async function renameStage(
  id: string,
  name: string,
): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const parsed = nameSchema.safeParse(name)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const clash = await prisma.productionStage.findFirst({
    where: { name: { equals: parsed.data, mode: 'insensitive' }, id: { not: id } },
  })

  if (clash) {
    return { ok: false, error: 'A stage with that name already exists' }
  }

  await prisma.productionStage.update({
    where: { id },
    data: { name: parsed.data },
  })

  revalidatePath('/production')
  revalidatePath('/production/stages')

  return { ok: true, message: 'Stage renamed' }
}

export async function moveStage(
  id: string,
  direction: 'up' | 'down',
): Promise<SimpleResult> {
  await requireCapability('settings:update')

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

  revalidatePath('/production')
  revalidatePath('/production/stages')

  return { ok: true, message: 'Order updated' }
}

export async function setStageActive(
  id: string,
  isActive: boolean,
): Promise<SimpleResult> {
  await requireCapability('settings:update')

  const inUse = await prisma.productionTask.count({
    where: { stageId: id, status: { in: ['PENDING', 'IN_PROGRESS', 'ON_HOLD'] } },
  })

  if (!isActive && inUse > 0) {
    return {
      ok: false,
      error: `${inUse} open task${inUse === 1 ? '' : 's'} still sit in this stage`,
    }
  }

  await prisma.productionStage.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath('/production')
  revalidatePath('/production/stages')

  return { ok: true, message: isActive ? 'Stage enabled' : 'Stage retired' }
}
