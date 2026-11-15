import { prisma } from '@/lib/prisma'
import { keysetClause, type PageArgs } from '@/lib/api/keyset'
import type { ItemType } from '@/generated/prisma/enums'

type DecimalLike = { toNumber: () => number }

function toNumber(value: DecimalLike | null): number | null {
  return value === null ? null : value.toNumber()
}

export async function listItems({
  search,
  type,
  includeInactive = false,
  page,
}: {
  search?: string
  type?: ItemType
  includeInactive?: boolean
  /** Keyset page (the mobile API); omit for every row. */
  page?: PageArgs
} = {}) {
  const term = search?.trim()

  const items = await prisma.item.findMany({
    ...(page ? { take: page.take } : {}),
    where: {
      // Keyset paging orders by (name, id) and is for active items only.
      AND: keysetClause(page, 'name', 'asc', 'string'),
      ...(type ? { type } : {}),
      ...(includeInactive ? {} : { isActive: true }),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { code: { contains: term, mode: 'insensitive' } },
              { brand: { contains: term, mode: 'insensitive' } },
              { shade: { contains: term, mode: 'insensitive' } },
              { hsnCode: { contains: term } },
              { material: { name: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: page
      ? [{ name: 'asc' }, { id: 'asc' }]
      : [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      supplyType: true,
      isFlatRate: true,
      unit: true,
      rate: true,
      taxRatePercent: true,
      brand: true,
      dimensionUnit: true,
      thickness: true,
      isActive: true,
      updatedAt: true,
      material: { select: { id: true, name: true } },
    },
  })

  return items.map((item) => ({
    ...item,
    rate: item.rate.toNumber(),
    taxRatePercent: item.taxRatePercent.toNumber(),
    thickness: toNumber(item.thickness),
  }))
}

export async function getItem(id: string) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      material: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  })

  if (!item) {
    return null
  }

  return {
    ...item,
    rate: item.rate.toNumber(),
    purchaseRate: toNumber(item.purchaseRate),
    reorderLevel: toNumber(item.reorderLevel),
    taxRatePercent: item.taxRatePercent.toNumber(),
    thickness: toNumber(item.thickness),
    length: toNumber(item.length),
    width: toNumber(item.width),
  }
}

export async function listMaterials() {
  return prisma.material.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
}

export type ItemListItem = Awaited<ReturnType<typeof listItems>>[number]
export type MaterialOption = Awaited<
  ReturnType<typeof listMaterials>
>[number]
