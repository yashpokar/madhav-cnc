import type {
  DimensionUnit,
  ItemType,
  UnitOfMeasure,
} from '@/generated/prisma/enums'

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  MATERIAL: 'Sheet material',
  HARDWARE: 'Hardware & fittings',
  SERVICE: 'Service / job work',
  FINISHED_GOOD: 'Finished unit',
}

export const ITEM_TYPE_SHORT: Record<ItemType, string> = {
  MATERIAL: 'Material',
  HARDWARE: 'Hardware',
  SERVICE: 'Service',
  FINISHED_GOOD: 'Finished',
}

export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  SQFT: 'Square feet (sqft)',
  SQM: 'Square metres (sqm)',
  RFT: 'Running feet (rft)',
  RMT: 'Running metres (rmt)',
  NOS: 'Pieces (nos)',
  SHEET: 'Sheets',
  SET: 'Sets',
  KG: 'Kilograms (kg)',
  LTR: 'Litres',
  HOUR: 'Hours',
}

export const UNIT_SHORT: Record<UnitOfMeasure, string> = {
  SQFT: 'sqft',
  SQM: 'sqm',
  RFT: 'rft',
  RMT: 'rmt',
  NOS: 'nos',
  SHEET: 'sheet',
  SET: 'set',
  KG: 'kg',
  LTR: 'ltr',
  HOUR: 'hr',
}

export const DIMENSION_UNIT_LABELS: Record<DimensionUnit, string> = {
  MM: 'Millimetres (mm)',
  INCH: 'Inches (in)',
  FT: 'Feet (ft)',
}

export const DIMENSION_UNIT_SHORT: Record<DimensionUnit, string> = {
  MM: 'mm',
  INCH: 'in',
  FT: 'ft',
}
