import { prisma } from '@/lib/prisma'
import type { OrderStatus, PaymentMode } from '@/generated/prisma/enums'

/** What a fresh company starts with; everything else (customers, items...) is empty. */
export type CompanySeed = {
  stages: { name: string; sortOrder: number; isActive: boolean; linkedStatus: OrderStatus | null }[]
  categories: { name: string; sortOrder: number; isActive: boolean }[]
  channels: { name: string; mode: PaymentMode; sortOrder: number; isActive: boolean }[]
}

const EXPENSE_CATEGORIES = [
  'Raw material',
  'Hardware & fittings',
  'Job work',
  'Consumables',
  'Salary & wages',
  'Rent',
  'Electricity',
  'Machine maintenance',
  'Transport & freight',
  'Marketing',
  'Office & admin',
  'Bank & finance charges',
  'Taxes & fees',
  'Commission',
  'Other',
]

/**
 * Built-in starting set. Used for self-service companies so a new person never
 * receives (or can infer) another company's own stages, categories or modes.
 * Document counters need no seeding: they start at 1 on first use.
 */
export const DEFAULT_SEED: CompanySeed = {
  stages: [
    { name: 'Confirmation', sortOrder: 10, isActive: true, linkedStatus: 'CONFIRMED' },
    { name: 'Process', sortOrder: 20, isActive: true, linkedStatus: 'IN_PRODUCTION' },
    { name: 'Ready to dispatch', sortOrder: 30, isActive: true, linkedStatus: 'READY' },
    { name: 'Delivered', sortOrder: 40, isActive: true, linkedStatus: 'DISPATCHED' },
  ],
  categories: EXPENSE_CATEGORIES.map((name, index) => ({
    name,
    sortOrder: (index + 1) * 10,
    isActive: true,
  })),
  channels: [
    { name: 'Cash', mode: 'CASH', sortOrder: 10, isActive: true },
    { name: 'UPI', mode: 'UPI', sortOrder: 20, isActive: true },
    { name: 'Bank transfer', mode: 'BANK_TRANSFER', sortOrder: 30, isActive: true },
    { name: 'Cheque', mode: 'CHEQUE', sortOrder: 40, isActive: true },
    { name: 'Card', mode: 'CARD', sortOrder: 50, isActive: true },
  ],
}

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
      updatedById: actorId,
      createdById: createdById ?? null,
      productionStages: { create: seed.stages },
      expenseCategorys: { create: seed.categories },
      paymentChannels: { create: seed.channels },
    },
    select: { id: true },
  })
}
