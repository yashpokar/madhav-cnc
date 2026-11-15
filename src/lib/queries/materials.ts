import { prisma } from '@/lib/prisma'

export async function listAllMaterials() {
  const rows = await prisma.material.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      isActive: true,
      stockTracked: true,
      reorderLevel: true,
      _count: { select: { items: true } },
    },
  })

  return rows.map((row) => ({
    ...row,
    reorderLevel: row.reorderLevel ? row.reorderLevel.toNumber() : null,
  }))
}

export type MaterialRow = Awaited<ReturnType<typeof listAllMaterials>>[number]
