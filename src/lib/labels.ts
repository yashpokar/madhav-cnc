import type {
  DimensionUnit,
  ItemType,
  MaterialSupply,
  OrderStatus,
  QuotationStatus,
  SupplyType,
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

export const SUPPLY_TYPE_LABELS: Record<SupplyType, string> = {
  GOODS: 'Goods',
  SERVICE: 'Service',
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

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  CONVERTED: 'Converted',
}

export const QUOTATION_STATUS_COLORS: Record<
  QuotationStatus,
  'zinc' | 'blue' | 'lime' | 'red' | 'amber' | 'purple'
> = {
  DRAFT: 'zinc',
  SENT: 'blue',
  ACCEPTED: 'lime',
  REJECTED: 'red',
  EXPIRED: 'amber',
  CONVERTED: 'purple',
}

export const MATERIAL_SUPPLY_LABELS: Record<MaterialSupply, string> = {
  WITH_MATERIAL: 'With material',
  WITHOUT_MATERIAL: 'Without material',
}

export const MATERIAL_SUMMARY_LABELS = {
  WITH: 'With material',
  WITHOUT: 'Without material',
  MIXED: 'Mixed material',
  NONE: 'No lines',
} as const

export const MATERIAL_SUMMARY_COLORS = {
  WITH: 'sky',
  WITHOUT: 'orange',
  MIXED: 'amber',
  NONE: 'zinc',
} as const

export const MATERIAL_SUPPLY_DESCRIPTIONS: Record<MaterialSupply, string> = {
  WITH_MATERIAL: 'We supply the material and do the work.',
  WITHOUT_MATERIAL: 'Customer brings the material; we charge job work only.',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  IN_PRODUCTION: 'In production',
  READY: 'Ready',
  DISPATCHED: 'Dispatched',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const ORDER_STATUS_COLORS: Record<
  OrderStatus,
  'zinc' | 'blue' | 'amber' | 'cyan' | 'purple' | 'lime' | 'red'
> = {
  DRAFT: 'zinc',
  CONFIRMED: 'blue',
  IN_PRODUCTION: 'amber',
  READY: 'cyan',
  DISPATCHED: 'purple',
  COMPLETED: 'lime',
  CANCELLED: 'red',
}
