import { DIMENSION_UNIT_SHORT, MATERIAL_SUPPLY_LABELS } from '@/lib/labels'
import type { DimensionUnit, MaterialSupply } from '@/generated/prisma/enums'

type NumberLike = number | string | { toString: () => string } | null | undefined

const num = (value: NumberLike) =>
  value === null || value === undefined ? null : Number(value)

/** e.g. "6 × 9 in × 2 pcs"; null when the line has no size. */
export function sizeText(
  unit: DimensionUnit | null,
  length: NumberLike,
  width: NumberLike,
  pieces: NumberLike,
): string | null {
  const l = num(length)
  const w = num(width)

  if (!unit || l === null || w === null) {
    return null
  }

  const p = num(pieces)
  const base = `${l} × ${w} ${DIMENSION_UNIT_SHORT[unit]}`

  return p && p > 0 ? `${base} × ${p} pcs` : base
}

export type LineDetails = {
  materialName: string | null
  materialSupply: MaterialSupply | null
  sizeText: string | null
  specText: string | null
}

/** e.g. "Greenply · Shade 12 · 18 mm"; null when the item records none. */
export function specText(item: {
  brand: string | null
  shade: string | null
  thickness: NumberLike
  dimensionUnit: DimensionUnit | null
} | null | undefined): string | null {
  if (!item) {
    return null
  }

  const thickness = num(item.thickness)
  const parts = [
    item.brand,
    item.shade ? `Shade ${item.shade}` : null,
    thickness && thickness > 0 && item.dimensionUnit
      ? `${thickness} ${DIMENSION_UNIT_SHORT[item.dimensionUnit]} thick`
      : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : null
}

/** Details an order line contributes to the invoice line made from it. */
export function detailsFromOrderLine(line: {
  materialSupply: MaterialSupply
  dimensionUnit: DimensionUnit | null
  length: NumberLike
  width: NumberLike
  pieces: NumberLike
  item?: {
    brand: string | null
    shade: string | null
    thickness: NumberLike
    dimensionUnit: DimensionUnit | null
    material: { name: string } | null
  } | null
}): LineDetails {
  return {
    materialName: line.item?.material?.name ?? null,
    materialSupply: line.materialSupply,
    sizeText: sizeText(line.dimensionUnit, line.length, line.width, line.pieces),
    specText: specText(line.item),
  }
}

/** One readable line, e.g. "Material: Teak · With material · 6 × 9 in × 2 pcs". */
export function describeLineDetails(details: Partial<LineDetails>): string | null {
  const parts = [
    details.materialName ? `Material: ${details.materialName}` : null,
    details.materialSupply ? MATERIAL_SUPPLY_LABELS[details.materialSupply] : null,
    details.specText,
    details.sizeText ? `Size: ${details.sizeText}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : null
}
