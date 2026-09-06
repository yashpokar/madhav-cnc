import { prisma } from '@/lib/prisma'

export async function listAllMaterials() {
  return prisma.material.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      isActive: true,
      _count: { select: { items: true } },
    },
  })
}

export type MaterialRow = Awaited<ReturnType<typeof listAllMaterials>>[number]
