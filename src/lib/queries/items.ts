import { prisma } from '@/lib/prisma'
import type { ItemType } from '@/generated/prisma/enums'

type DecimalLike = { toNumber: () => number }

function toNumber(value: DecimalLike | null): number | null {
  return value === null ? null : value.toNumber()
}

export async function listItems({
  search,
  type,
  includeInactive = false,
}: {
  search?: string
  type?: ItemType
  includeInactive?: boolean
} = {}) {
  const term = search?.trim()

  const items = await prisma.item.findMany({
    where: {
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
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
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
