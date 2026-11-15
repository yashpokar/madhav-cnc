import { prisma } from '@/lib/prisma'
import type { CompanySeed } from '@/lib/industry-seed'
import type { IndustryKey } from '@/lib/industry'

export { DEFAULT_SEED, seedForIndustry } from '@/lib/industry-seed'
export type { CompanySeed }
/**
 * The seed copied from the company currently being worked in. Only for a
 * platform super-admin who already has an active company; reads are scoped to it.
 */
export async function readSeedFromActiveCompany(): Promise<CompanySeed> {
  const [stages, categories, channels] = await Promise.all([
    prisma.productionStage.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.expenseCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.paymentChannel.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])

  return {
    stages: stages.map((r) => ({
      name: r.name,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      linkedStatus: r.linkedStatus,
    })),
    categories: categories.map((r) => ({ name: r.name, sortOrder: r.sortOrder, isActive: r.isActive })),
    channels: channels.map((r) => ({
      name: r.name,
      mode: r.mode,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    })),
  }
}

export type NewCompany = {
  companyName: string
  gstin?: string | null
  phone?: string | null
  city?: string | null
  industry?: IndustryKey
}

/**
 * Creates a company together with its starting stages, expense categories and
 * payment modes in one write, so a company is never left half set up.
 * `createdById` is set only for self-service companies.
 */
export async function createCompanyWithSeed({
  details,
  seed,
  actorId,
  createdById,
}: {
  details: NewCompany
  seed: CompanySeed
  actorId: string
  createdById?: string
}): Promise<{ id: string }> {
  return prisma.companySetting.create({
    data: {
      companyName: details.companyName,
      gstin: details.gstin ?? null,
      phone: details.phone ?? null,
      city: details.city ?? null,
      industry: details.industry ?? 'MANUFACTURING',
      updatedById: actorId,
      createdById: createdById ?? null,
      productionStages: { create: seed.stages },
      expenseCategorys: { create: seed.categories },
      paymentChannels: { create: seed.channels },
      ...(seed.items?.length ? { items: { create: seed.items } } : {}),
    },
    select: { id: true },
  })
}
