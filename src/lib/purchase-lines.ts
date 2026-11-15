import type { UnitOfMeasure } from '@/generated/prisma/enums'

/** Shared by server pages (blank first line) and the client line editor. */
export type PurchaseLine = {
  key: string
  itemId: string | null
  materialId: string | null
  poLineId: string | null
  description: string
  hsnCode: string
  unit: UnitOfMeasure
  qty: string
  rate: string
  /** A flat amount off the line. */
  discount: string
  taxRatePercent: string
}

export function emptyPurchaseLine(): PurchaseLine {
  return {
    key: Math.random().toString(36).slice(2),
    itemId: null,
    materialId: null,
    poLineId: null,
    description: '',
    hsnCode: '',
    unit: 'NOS',
    qty: '1',
    rate: '0',
    discount: '0',
    taxRatePercent: '0',
  }
}
