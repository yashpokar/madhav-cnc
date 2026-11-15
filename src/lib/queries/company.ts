import { prisma } from '@/lib/prisma'
import { requireCompanyId } from '@/lib/active-company'

export async function getCompanySetting() {
  const existing = await prisma.companySetting.findUnique({
    where: { id: await requireCompanyId() },
    include: { updatedBy: { select: { name: true } } },
  })

  if (existing) {
    return existing
  }

  return prisma.companySetting.create({
    data: { id: await requireCompanyId() },
    include: { updatedBy: { select: { name: true } } },
  })
}

export async function getDefaultAdvancePercent() {
  const setting = await prisma.companySetting.findUnique({
    where: { id: await requireCompanyId() },
    select: { defaultAdvancePercent: true },
  })

  return setting ? setting.defaultAdvancePercent.toNumber() : 80
}

export type CompanySetting = Awaited<ReturnType<typeof getCompanySetting>>
