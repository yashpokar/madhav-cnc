/**
 * Which Prisma models are audited and which are not. The database triggers
 * (prisma/migrations/*_audit_trail) do the capturing; this file is the
 * documented list of what they cover, and src/lib/audit-trail/coverage.test.ts
 * fails if a model in prisma/schema.prisma is on neither list, or if this list
 * and the triggers disagree. So a new model can not silently escape the trail.
 *
 * To add a model: add `SELECT audit_attach(...)` in a new migration, then list
 * it in AUDITED below (docs/AUDIT.md, "Adding a model").
 */

export type AuditedModel = {
  /** Table the trigger sits on. */
  table: string
  /** Columns masked in snapshots: the fact of a change is kept, the value is not. */
  secrets?: readonly string[]
  /** For line items: the document model their events are also shown under. */
  parent?: string
}

export const AUDITED: Readonly<Record<string, AuditedModel>> = {
  User: { table: 'users' },
  Account: { table: 'accounts', secrets: ['password', 'access_token', 'refresh_token', 'id_token'] },
  Partner: { table: 'partners' },
  Customer: { table: 'customers' },
  Material: { table: 'materials' },
  Item: { table: 'items' },
  Quotation: { table: 'quotations' },
  QuotationLine: { table: 'quotation_lines', parent: 'Quotation' },
  Order: { table: 'orders', secrets: ['tracking_token'] },
  OrderLine: { table: 'order_lines', parent: 'Order' },
  ProductionStage: { table: 'production_stages' },
  ProductionTask: { table: 'production_tasks', parent: 'Order' },
  QuotationAttachment: { table: 'quotation_attachments', parent: 'Quotation' },
  CompanySetting: { table: 'company_settings', secrets: ['account_number~'] },
  QuotationShare: { table: 'quotation_shares', secrets: ['token'], parent: 'Quotation' },
  QuotationComment: { table: 'quotation_comments', parent: 'Quotation' },
  Dispatch: { table: 'dispatches' },
  DispatchLine: { table: 'dispatch_lines', parent: 'Dispatch' },
  QuotationShareResponse: { table: 'quotation_share_responses', parent: 'QuotationShare' },
  Invoice: { table: 'invoices', secrets: ['share_token'] },
  InvoiceLine: { table: 'invoice_lines', parent: 'Invoice' },
  InvoiceWriteOff: { table: 'invoice_write_offs', parent: 'Invoice' },
  PaymentChannel: { table: 'payment_channels' },
  Payment: { table: 'payments' },
  PaymentAllocation: { table: 'payment_allocations', parent: 'Payment' },
  ExpenseCategory: { table: 'expense_categories' },
  Expense: { table: 'expenses' },
  CreditDebitNote: { table: 'credit_debit_notes' },
  CreditDebitNoteLine: { table: 'credit_debit_note_lines', parent: 'CreditDebitNote' },
  Vendor: { table: 'vendors' },
  UserCompany: { table: 'user_companies' },
  PurchaseOrder: { table: 'purchase_orders' },
  PurchaseOrderLine: { table: 'purchase_order_lines', parent: 'PurchaseOrder' },
  PurchaseBill: { table: 'purchase_bills' },
  PurchaseBillLine: { table: 'purchase_bill_lines', parent: 'PurchaseBill' },
  GoodsReceipt: { table: 'goods_receipts' },
  GoodsReceiptLine: { table: 'goods_receipt_lines', parent: 'GoodsReceipt' },
  StockMovement: { table: 'stock_movements' },
  VendorPayment: { table: 'vendor_payments' },
  VendorPaymentAllocation: { table: 'vendor_payment_allocations', parent: 'VendorPayment' },
  ChannelOpeningBalance: { table: 'channel_opening_balances' },
  BalanceAdjustment: { table: 'balance_adjustments' },
  Invitation: { table: 'invitations', secrets: ['token'] },
  Upload: { table: 'uploads' },
  CompanySubscription: { table: 'company_subscriptions' },
  BillingPayment: { table: 'billing_payments' },
}

/** Models deliberately NOT audited, and why. Every entry needs a reason. */
export const EXCLUDED: Readonly<Record<string, string>> = {
  Session:
    'Sign-in sessions: short-lived credentials created on every login. They hold tokens, not business data, and would bury the trail in noise.',
  Verification:
    'One-time email/sign-in verification codes: short-lived secrets, not business data.',
  IdempotencyKey:
    'API replay records (a stored response per Idempotency-Key). A cache that is purged on a schedule; the change it protected is audited itself.',
  DeviceToken:
    'Push-notification tokens of phones: rotating device secrets, not business data.',
  DocumentCounter:
    'The last number issued per document kind. Derived: every number issued appears on the (audited) document that took it.',
  ActivityLog:
    'The human-readable summary lines (logActivity). A log itself; kept as a readable companion and linked to events by time and request, not audited again.',
  AuditEvent: 'The audit table itself: append-only and protected by its own triggers.',
}

/** Columns an event never shows as a change (housekeeping). */
export const HOUSEKEEPING_COLUMNS = ['updated_at'] as const

export const isAudited = (model: string) => model in AUDITED
