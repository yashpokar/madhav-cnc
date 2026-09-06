import type { DimensionUnit } from '@/generated/prisma/enums'

export type LineInput = {
  quantity: number
  rate: number
  discountPercent: number
  taxRatePercent: number
}

export type LineTotals = {
  amount: number
  taxAmount: number
  lineTotal: number
}

export type DocumentTotals = {
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  roundOff: number
  total: number
}

export type TransportInput = {
  transportCharge?: number
  transportTaxRatePercent?: number
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const SQFT_PER: Record<DimensionUnit, number> = {
  MM: 1 / (304.8 * 304.8),
  INCH: 1 / 144,
  FT: 1,
}

export function areaInSqft(
  length: number,
  width: number,
  unit: DimensionUnit,
): number {
  return round2(length * width * SQFT_PER[unit] * 1000) / 1000
}

export function derivedQuantity({
  length,
  width,
  pieces,
  dimensionUnit,
}: {
  length: number | null
  width: number | null
  pieces: number | null
  dimensionUnit: DimensionUnit | null
}): number | null {
  if (length === null || width === null || dimensionUnit === null) {
    return null
  }

  const area = areaInSqft(length, width, dimensionUnit)

  return Math.round(area * (pieces ?? 1) * 1000) / 1000
}

export function lineTotals(line: LineInput): LineTotals {
  const gross = line.quantity * line.rate
  const discount = gross * (line.discountPercent / 100)
  const amount = round2(gross - discount)
  const taxAmount = round2(amount * (line.taxRatePercent / 100))

  return { amount, taxAmount, lineTotal: round2(amount + taxAmount) }
}

export function documentTotals({
  lines,
  discountType,
  discountValue,
  transportCharge = 0,
  transportTaxRatePercent = 0,
}: {
  lines: LineInput[]
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT'
  discountValue: number
} & TransportInput): DocumentTotals {
  const computed = lines.map(lineTotals)
  const subtotal = round2(
    computed.reduce((sum, line) => sum + line.amount, 0),
  )

  let discountAmount = 0

  if (discountType === 'PERCENT') {
    discountAmount = round2(subtotal * (discountValue / 100))
  } else if (discountType === 'AMOUNT') {
    discountAmount = round2(Math.min(discountValue, subtotal))
  }

  const discountRatio = subtotal === 0 ? 0 : discountAmount / subtotal
  const taxableAmount = round2(subtotal - discountAmount + transportCharge)

  const lineTax = computed.reduce(
    (sum, line) => sum + line.taxAmount * (1 - discountRatio),
    0,
  )
  const transportTax = transportCharge * (transportTaxRatePercent / 100)
  const taxAmount = round2(lineTax + transportTax)

  const beforeRounding = round2(taxableAmount + taxAmount)
  const total = Math.round(beforeRounding)
  const roundOff = round2(total - beforeRounding)

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    roundOff,
    total,
  }
}
