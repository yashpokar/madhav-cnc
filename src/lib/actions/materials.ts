'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

const nameSchema = z.string().trim().min(1, 'Material name is required').max(100)

export async function createMaterial(name: string): Promise<SimpleResult> {
  const user = await requireCapability('item:create')
  const parsed = nameSchema.safeParse(name)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const clash = await prisma.material.findFirst({
    where: { name: { equals: parsed.data, mode: 'insensitive' } },
  })

  if (clash) {
    return { ok: false, error: 'A material with that name already exists' }
  }

  const last = await prisma.material.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  await prisma.material.create({
    data: {
      name: parsed.data,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdById: user.id,
    },
  })

  revalidatePath('/items')
  revalidatePath('/items/materials')

  return { ok: true, message: `${parsed.data} added` }
}

export async function renameMaterial(
  id: string,
  name: string,
): Promise<SimpleResult> {
  await requireCapability('item:update')
  const parsed = nameSchema.safeParse(name)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const clash = await prisma.material.findFirst({
    where: {
      name: { equals: parsed.data, mode: 'insensitive' },
      id: { not: id },
    },
  })

  if (clash) {
    return { ok: false, error: 'A material with that name already exists' }
  }

  await prisma.material.update({
    where: { id },
    data: { name: parsed.data },
  })

  revalidatePath('/items')
  revalidatePath('/items/materials')

  return { ok: true, message: 'Material renamed' }
}

export async function moveMaterial(
  id: string,
  direction: 'up' | 'down',
): Promise<SimpleResult> {
  await requireCapability('item:update')

  const materials = await prisma.material.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  })

  const index = materials.findIndex((material) => material.id === id)

  if (index === -1) {
    return { ok: false, error: 'Material not found' }
  }

  const swapWith = direction === 'up' ? index - 1 : index + 1

  if (swapWith < 0 || swapWith >= materials.length) {
    return { ok: false, error: 'Already at the end' }
  }

  await prisma.$transaction([
    prisma.material.update({
      where: { id: materials[index].id },
      data: { sortOrder: swapWith },
    }),
    prisma.material.update({
      where: { id: materials[swapWith].id },
      data: { sortOrder: index },
    }),
  ])

  revalidatePath('/items')
  revalidatePath('/items/materials')

  return { ok: true, message: 'Order updated' }
}

export async function setMaterialActive(
  id: string,
  isActive: boolean,
): Promise<SimpleResult> {
  await requireCapability('item:update')

  if (!isActive) {
    const inUse = await prisma.item.count({
      where: { materialId: id, isActive: true },
    })

    if (inUse > 0) {
      return {
        ok: false,
        error: `${inUse} active item${inUse === 1 ? '' : 's'} still use this material`,
      }
    }
  }

  await prisma.material.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath('/items')
  revalidatePath('/items/materials')

  return { ok: true, message: isActive ? 'Material enabled' : 'Material retired' }
}
