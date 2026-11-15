import type { Action, Resource } from '@/lib/permissions'

/**
 * How an audited model is shown and who may read its history. The model name is
 * what audit events store as entity_type. A model missing here still appears in
 * the admin Audit log, just without a link or a per-record History.
 */
export type AuditModelInfo = {
  label: string
  /** Page of the record, when it has one. */
  href?: (id: string) => string
  /** Reading this record's history needs this capability. */
  read: `${Resource}:${Action}`
}

export const AUDIT_MODELS: Readonly<Record<string, AuditModelInfo>> = {
  Customer: { label: 'Customer', href: (id) => `/customers/${id}`, read: 'customer:read' },
  Partner: { label: 'Partner', href: (id) => `/partners/${id}`, read: 'partner:read' },
  Item: { label: 'Item', href: (id) => `/items/${id}`, read: 'item:read' },
  Material: { label: 'Material', read: 'item:read' },
  Quotation: { label: 'Quotation', href: (id) => `/quotations/${id}`, read: 'quotation:read' },
  Order: { label: 'Order', href: (id) => `/orders/${id}`, read: 'order:read' },
  Dispatch: { label: 'Challan', href: (id) => `/dispatch/${id}`, read: 'dispatch:read' },
  Invoice: { label: 'Invoice', href: (id) => `/invoices/${id}`, read: 'invoice:read' },
  Payment: { label: 'Payment', href: (id) => `/payments/${id}`, read: 'payment:read' },
  Expense: { label: 'Expense', href: (id) => `/expenses/${id}`, read: 'expense:read' },
  CreditDebitNote: { label: 'Credit/debit note', href: (id) => `/notes/${id}`, read: 'note:read' },
  Vendor: { label: 'Vendor', href: (id) => `/vendors/${id}`, read: 'expense:read' },
  PurchaseOrder: { label: 'Purchase order', href: (id) => `/purchase-orders/${id}`, read: 'purchase:read' },
  PurchaseBill: { label: 'Purchase bill', href: (id) => `/purchase-bills/${id}`, read: 'purchase:read' },
  GoodsReceipt: { label: 'Goods receipt', href: (id) => `/goods-receipts/${id}`, read: 'purchase:read' },
  VendorPayment: { label: 'Vendor payment', href: (id) => `/vendor-payments/${id}`, read: 'purchase:read' },
  StockMovement: { label: 'Stock movement', read: 'stock:read' },
  BalanceAdjustment: { label: 'Adjustment', href: () => '/adjustments', read: 'settings:update' },
  ChannelOpeningBalance: { label: 'Opening balance', href: () => '/settings/opening-balances', read: 'settings:update' },
  CompanySetting: { label: 'Company settings', href: () => '/settings/company', read: 'settings:update' },
}

/** The URL segment the mobile API uses for each historied record type. */
export const API_HISTORY_ENTITIES = {
  customers: 'Customer',
  quotations: 'Quotation',
  orders: 'Order',
  invoices: 'Invoice',
  payments: 'Payment',
  expenses: 'Expense',
  vendors: 'Vendor',
  'purchase-bills': 'PurchaseBill',
} as const

export type ApiHistoryEntity = keyof typeof API_HISTORY_ENTITIES

export const modelLabel = (model: string) => AUDIT_MODELS[model]?.label ?? model.replace(/([a-z])([A-Z])/g, '$1 $2')
