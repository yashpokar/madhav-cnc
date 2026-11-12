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

const INCH_PER: Record<DimensionUnit, number> = {
  MM: 1 / 25.4,
  INCH: 1,
  FT: 12,
}

/** Boards are sold in steps of 3 inches, so every side is rounded up to one. */
export const SIZE_STEP_INCH = 3

/**
 * The size that is actually taken (and billed) for an entered side:
 * 3 in -> 3, 4 -> 6, 5 -> 6, 6 -> 6, 7 -> 9; 2.1 ft -> 2.25 ft.
 * The result stays in the unit it was entered in.
 */
export function billedSize(value: number, unit: DimensionUnit): number {
  if (!Number.isFinite(value) || value <= 0) {
    return value
  }

  const inches = value * INCH_PER[unit]
  // The small tolerance stops 6.0000000001 from jumping to the next step.
  const steps = Math.ceil(inches / SIZE_STEP_INCH - 1e-9)

  return Math.round(((steps * SIZE_STEP_INCH) / INCH_PER[unit]) * 1000) / 1000
}

type SizedLine = {
  isFlatRate?: boolean
  /** false = bill the size exactly as entered. Defaults to true. */
  autoSize?: boolean
  dimensionUnit: DimensionUnit | null
  length: number | null
  width: number | null
  pieces: number | null
  quantity: number
}

/**
 * Applies the 3-inch rule to a line: snaps length and width and re-derives the
 * quantity from them. Flat-rate and size-less lines are left alone.
 */
export function applySizeRule<T extends SizedLine>(line: T): T {
  if (
    line.isFlatRate ||
    line.autoSize === false ||
    line.dimensionUnit === null ||
    line.length === null ||
    line.width === null
  ) {
    return line
  }

  const length = billedSize(line.length, line.dimensionUnit)
  const width = billedSize(line.width, line.dimensionUnit)
  const quantity = derivedQuantity({
    length,
    width,
    pieces: line.pieces,
    dimensionUnit: line.dimensionUnit,
  })

  return { ...line, length, width, quantity: quantity ?? line.quantity }
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

export type GstSplit = {
  cgst: number
  sgst: number
  igst: number
  total: number
}

export function splitGst(
  taxAmount: number,
  isInterState: boolean,
): GstSplit {
  const total = round2(taxAmount)

  if (isInterState) {
    return { cgst: 0, sgst: 0, igst: total, total }
  }

  const half = round2(total / 2)
  const other = round2(total - half)

  return { cgst: half, sgst: other, igst: 0, total }
}

export function sameState(a: string | null, b: string | null): boolean {
  if (!a || !b) {
    return false
  }

  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function paymentSplit(total: number, advancePercent: number) {
  const advance = round2(total * (advancePercent / 100))
  const balance = round2(total - advance)

  return { advance, balance }
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
