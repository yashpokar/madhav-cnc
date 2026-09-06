import { prisma } from '@/lib/prisma'

export async function getCompanySetting() {
  const existing = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    include: { updatedBy: { select: { name: true } } },
  })

  if (existing) {
    return existing
  }

  return prisma.companySetting.create({
    data: { id: 'default' },
    include: { updatedBy: { select: { name: true } } },
  })
}

export type CompanySetting = Awaited<ReturnType<typeof getCompanySetting>>
