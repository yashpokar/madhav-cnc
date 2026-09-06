import type {
  DimensionUnit,
  DispatchStatus,
  InvoiceStatus,
  ItemType,
  NoteKind,
  NoteParty,
  NoteReason,
  NoteStatus,
  PaymentMode,
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

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  CANCELLED: 'Cancelled',
}

export const INVOICE_STATUS_COLORS: Record<
  InvoiceStatus,
  'zinc' | 'blue' | 'red'
> = {
  DRAFT: 'zinc',
  ISSUED: 'blue',
  CANCELLED: 'red',
}

export const PAYMENT_STATE_LABELS = {
  UNPAID: 'Unpaid',
  PART_PAID: 'Part paid',
  PAID: 'Paid',
} as const

export const PAYMENT_STATE_COLORS = {
  UNPAID: 'amber',
  PART_PAID: 'cyan',
  PAID: 'lime',
} as const

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  OTHER: 'Other',
}

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  DRAFT: 'Draft',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

export const DISPATCH_STATUS_COLORS: Record<
  DispatchStatus,
  'zinc' | 'purple' | 'lime' | 'red'
> = {
  DRAFT: 'zinc',
  DISPATCHED: 'purple',
  DELIVERED: 'lime',
  CANCELLED: 'red',
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

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  CREDIT: 'Credit note',
  DEBIT: 'Debit note',
}

export const NOTE_KIND_SHORT: Record<NoteKind, string> = {
  CREDIT: 'Credit',
  DEBIT: 'Debit',
}

export const NOTE_KIND_COLORS: Record<NoteKind, 'lime' | 'orange'> = {
  CREDIT: 'lime',
  DEBIT: 'orange',
}

export const NOTE_KIND_DESCRIPTIONS: Record<NoteKind, string> = {
  CREDIT: 'We owe the party — sales return, rate drop or a discount given after billing.',
  DEBIT: 'The party owes us — purchase return, short supply or a rate correction in our favour.',
}

export const NOTE_PARTY_LABELS: Record<NoteParty, string> = {
  CUSTOMER: 'Customer',
  VENDOR: 'Vendor / supplier',
}

export const NOTE_REASON_LABELS: Record<NoteReason, string> = {
  SALES_RETURN: 'Sales return',
  PURCHASE_RETURN: 'Purchase return',
  RATE_DIFFERENCE: 'Rate difference',
  DISCOUNT: 'Post-sale discount',
  SHORT_SUPPLY: 'Short supply',
  DAMAGED_GOODS: 'Damaged goods',
  OTHER: 'Other',
}

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  CANCELLED: 'Cancelled',
}

export const NOTE_STATUS_COLORS: Record<NoteStatus, 'zinc' | 'blue' | 'red'> = {
  DRAFT: 'zinc',
  ISSUED: 'blue',
  CANCELLED: 'red',
}
