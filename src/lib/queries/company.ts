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

export async function getDefaultAdvancePercent() {
  const setting = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { defaultAdvancePercent: true },
  })

  return setting ? setting.defaultAdvancePercent.toNumber() : 80
}

export type CompanySetting = Awaited<ReturnType<typeof getCompanySetting>>
