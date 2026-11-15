import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { getActiveCompanyId, requireCompanyId } from '@/lib/active-company'
import { getIndustry, type IndustryTemplate } from '@/lib/industry'

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

/** The active company's industry template; companies without one behave as manufacturing. */
export const getActiveIndustry = cache(async (): Promise<IndustryTemplate> => {
  const companyId = await getActiveCompanyId()

  if (!companyId) return getIndustry(null)

  const row = await prisma.companySetting.findUnique({
    where: { id: companyId },
    select: { industry: true },
  })

  return getIndustry(row?.industry)
})
