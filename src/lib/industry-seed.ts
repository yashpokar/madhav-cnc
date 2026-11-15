import type { ItemType, OrderStatus, PaymentMode, SupplyType, UnitOfMeasure } from '@/generated/prisma/enums'
import { INDUSTRIES, SAMPLE_ITEM_NOTE, type IndustryKey } from '@/lib/industry'

/** What a fresh company starts with; everything else (customers, items...) is empty. */
export type CompanySeed = {
  stages: { name: string; sortOrder: number; isActive: boolean; linkedStatus: OrderStatus | null }[]
  categories: { name: string; sortOrder: number; isActive: boolean }[]
  channels: { name: string; mode: PaymentMode; sortOrder: number; isActive: boolean }[]
  /** Editable example items. Absent when copying from an existing company (customers and items start empty). */
  items?: {
    code: string
    name: string
    description: string
    type: ItemType
    supplyType: SupplyType
    unit: UnitOfMeasure
    rate: number
    hsnCode: string | null
    taxRatePercent: number
  }[]
}

const PAYMENT_CHANNELS: CompanySeed['channels'] = [
  { name: 'Cash', mode: 'CASH', sortOrder: 10, isActive: true },
  { name: 'UPI', mode: 'UPI', sortOrder: 20, isActive: true },
  { name: 'Bank transfer', mode: 'NEFT', sortOrder: 30, isActive: true },
  { name: 'Cheque', mode: 'CHEQUE', sortOrder: 40, isActive: true },
  { name: 'Card', mode: 'CARD', sortOrder: 50, isActive: true },
]

/**
 * The starting set for a company in the given industry: stages, expense
 * categories, example items and the usual payment modes. Used for self-service
 * companies so a new person never receives (or can infer) another company's
 * own stages, categories or modes. Document counters need no seeding: they
 * start at 1 on first use.
 */
export function seedForIndustry(key: IndustryKey): CompanySeed {
  const template = INDUSTRIES[key]

  return {
    stages: template.stages.map((stage, index) => ({
      name: stage.name,
      sortOrder: (index + 1) * 10,
      isActive: true,
      linkedStatus: stage.linkedStatus,
    })),
    categories: template.expenseCategories.map((name, index) => ({
      name,
      sortOrder: (index + 1) * 10,
      isActive: true,
    })),
    channels: PAYMENT_CHANNELS,
    items: template.sampleItems.map((item) => ({
      code: item.code,
      name: item.name,
      description: SAMPLE_ITEM_NOTE,
      type: item.type,
      supplyType: item.supplyType,
      unit: item.unit,
      rate: item.rate,
      hsnCode: item.hsnCode || null,
      taxRatePercent: item.gstRate,
    })),
  }
}

/** The manufacturing starting set: how every company began before industries existed. */
export const DEFAULT_SEED: CompanySeed = seedForIndustry('MANUFACTURING')

