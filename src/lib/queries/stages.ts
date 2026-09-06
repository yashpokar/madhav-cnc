import { prisma } from '@/lib/prisma'

export async function listAllStages() {
  return prisma.productionStage.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      isActive: true,
      _count: { select: { tasks: true } },
    },
  })
}

export type StageRow = Awaited<ReturnType<typeof listAllStages>>[number]
