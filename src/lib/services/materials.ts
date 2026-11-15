// Material (item category) writes as plain functions. Runs inside a company
// scope: the web session's active-company cookie or the API's X-Company-Id
// header. The scope layer filters every query by that company and stamps new
// rows, so nothing here takes a companyId from a caller. Ids that belong to
// another company simply are not found.
//
// Permission checks stay with the caller. Names are validated here with
// materialNameSchema, so the web and the API apply the same rule.

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { materialInputSchema } from '@/lib/validation/items'
import { fail, type Actor, type Failure } from '@/lib/services/people-shared'

export const materialNameSchema = z
  .string()
  .trim()
  .min(1, 'Material name is required')
  .max(100)

export type MaterialOk = { ok: true; message: string }

/** Pure: sort order for a material added after the current last one. */
export function nextSortOrder(lastSortOrder: number | null | undefined): number {
  return (lastSortOrder ?? -1) + 1
}

/** Pure: which two positions swap when moving a material, or why it cannot. */
export function swapTarget(
  ids: string[],
  id: string,
  direction: 'up' | 'down',
): { ok: true; index: number; swapWith: number } | { ok: false; error: string } {
  const index = ids.indexOf(id)

  if (index === -1) {
    return { ok: false, error: 'Material not found' }
  }

  const swapWith = direction === 'up' ? index - 1 : index + 1

  if (swapWith < 0 || swapWith >= ids.length) {
    return { ok: false, error: 'Already at the end' }
  }

  return { ok: true, index, swapWith }
}

/** Pure: why a reorder level is not acceptable, if it is not. */
export function reorderLevelError(reorderLevel: number | null): string | null {
  if (reorderLevel !== null && (!Number.isFinite(reorderLevel) || reorderLevel < 0)) {
    return 'Reorder level cannot be negative'
  }

  return null
}

/**
 * Used by the "add material" box inside the item form: returns the material
 * with this name if there is one (case-insensitive), otherwise creates it.
 */
export async function findOrCreateMaterial(
  actor: Actor,
  name: string,
): Promise<
  | { ok: true; created: boolean; material: { id: string; name: string } }
  | Failure
> {
  const parsed = materialInputSchema.safeParse({ name, sortOrder: 0 })

  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, 'VALIDATION_FAILED')
  }

  const existing = await prisma.material.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
    select: { id: true, name: true },
  })

  if (existing) {
    return { ok: true, created: false, material: existing }
  }

  const material = await prisma.material.create({
    data: { ...parsed.data, createdById: actor.id },
    select: { id: true, name: true },
  })

  return { ok: true, created: true, material }
}

export async function createMaterial(
  actor: Actor,
  name: string,
): Promise<MaterialOk | Failure> {
  const parsed = materialNameSchema.safeParse(name)

  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, 'VALIDATION_FAILED')
  }

  const clash = await prisma.material.findFirst({
    where: { name: { equals: parsed.data, mode: 'insensitive' } },
  })

  if (clash) {
    return fail('A material with that name already exists', 'CONFLICT', {
      existingId: clash.id,
    })
  }

  const last = await prisma.material.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  await prisma.material.create({
    data: {
      name: parsed.data,
      sortOrder: nextSortOrder(last?.sortOrder),
      createdById: actor.id,
    },
  })

  return { ok: true, message: `${parsed.data} added` }
}

export async function renameMaterial(
  id: string,
  name: string,
): Promise<MaterialOk | Failure> {
  const parsed = materialNameSchema.safeParse(name)

  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, 'VALIDATION_FAILED')
  }

  const clash = await prisma.material.findFirst({
    where: {
      name: { equals: parsed.data, mode: 'insensitive' },
      id: { not: id },
    },
  })

  if (clash) {
    return fail('A material with that name already exists', 'CONFLICT', {
      existingId: clash.id,
    })
  }

  const existing = await prisma.material.findUnique({ where: { id }, select: { id: true } })

  if (!existing) {
    return fail('Material not found', 'NOT_FOUND')
  }

  await prisma.material.update({ where: { id }, data: { name: parsed.data } })

  return { ok: true, message: 'Material renamed' }
}

export async function moveMaterial(
  id: string,
  direction: 'up' | 'down',
): Promise<MaterialOk | Failure> {
  const materials = await prisma.material.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  })

  const target = swapTarget(
    materials.map((material) => material.id),
    id,
    direction,
  )

  if (!target.ok) {
    return fail(target.error, target.error === 'Material not found' ? 'NOT_FOUND' : 'CONFLICT')
  }

  const { index, swapWith } = target

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

  return { ok: true, message: 'Order updated' }
}

/** Retiring is refused while active items still use the material. */
export async function setMaterialActive(
  id: string,
  isActive: boolean,
): Promise<MaterialOk | Failure> {
  if (!isActive) {
    const inUse = await prisma.item.count({
      where: { materialId: id, isActive: true },
    })

    if (inUse > 0) {
      return fail(`${inUse} active item${inUse === 1 ? '' : 's'} still use this material`)
    }
  }

  const existing = await prisma.material.findUnique({ where: { id }, select: { id: true } })

  if (!existing) {
    return fail('Material not found', 'NOT_FOUND')
  }

  await prisma.material.update({ where: { id }, data: { isActive } })

  return { ok: true, message: isActive ? 'Material enabled' : 'Material retired' }
}

/** Refuses while any item uses the material. */
export async function deleteMaterial(
  id: string,
): Promise<MaterialOk | Failure> {
  const material = await prisma.material.findUnique({
    where: { id },
    select: { name: true, _count: { select: { items: true } } },
  })

  if (!material) {
    return fail('Material not found', 'NOT_FOUND')
  }

  if (material._count.items > 0) {
    return fail(
      `${material.name} is used by ${material._count.items} item(s). Mark it inactive instead.`,
    )
  }

  await prisma.material.delete({ where: { id } })

  return { ok: true, message: `${material.name} deleted` }
}

/** Turns stock tracking on or off for a material, and sets its reorder level. */
export async function setMaterialStock(
  id: string,
  stockTracked: boolean,
  reorderLevel: number | null,
): Promise<MaterialOk | Failure> {
  const levelError = reorderLevelError(reorderLevel)

  if (levelError) {
    return fail(levelError, 'VALIDATION_FAILED')
  }

  const existing = await prisma.material.findUnique({ where: { id }, select: { id: true } })

  if (!existing) {
    return fail('Material not found', 'NOT_FOUND')
  }

  await prisma.material.update({
    where: { id },
    data: { stockTracked, reorderLevel: stockTracked ? reorderLevel : null },
  })

  return { ok: true, message: stockTracked ? 'Stock tracking on' : 'Stock tracking off' }
}
