/**
 * The pure rules behind tenant isolation (see company-scope.ts, which applies
 * them to every query). Kept free of the database so they can be tested.
 *
 * Three kinds of table:
 *  - SCOPED: has a companyId column. Filtered and stamped automatically.
 *  - CHILD: no companyId; belongs to a scoped table through a chain of
 *    relations (CHILD_PARENT). Filtered through that chain.
 *  - everything else (User, Session, Account, Verification, CompanySetting,
 *    UserCompany, DocumentCounter): global, never touched here.
 */

/** Tables whose rows belong to one company. */
export const SCOPED = new Set([
  'Partner',
  'Customer',
  'Material',
  'Item',
  'Quotation',
  'Order',
  'ProductionStage',
  'Dispatch',
  'Invoice',
  'Payment',
  'PaymentChannel',
  'ExpenseCategory',
  'Expense',
  'CreditDebitNote',
  'Vendor',
  'PurchaseOrder',
  'PurchaseBill',
  'GoodsReceipt',
  'StockMovement',
  'VendorPayment',
  'ChannelOpeningBalance',
  'ActivityLog',
])

/** Child tables: the relation path from the child up to a scoped table. */
export const CHILD_PARENT: Record<string, readonly string[]> = {
  QuotationLine: ['quotation'],
  OrderLine: ['order'],
  ProductionTask: ['order'],
  QuotationAttachment: ['quotation'],
  QuotationShare: ['quotation'],
  QuotationComment: ['quotation'],
  QuotationShareResponse: ['share', 'quotation'],
  DispatchLine: ['dispatch'],
  InvoiceLine: ['invoice'],
  InvoiceWriteOff: ['invoice'],
  PaymentAllocation: ['payment'],
  CreditDebitNoteLine: ['note'],
  PurchaseOrderLine: ['po'],
  PurchaseBillLine: ['bill'],
  GoodsReceiptLine: ['receipt'],
  VendorPaymentAllocation: ['vendorPayment'],
}

/**
 * Relations between company-owned tables, as `Model: relation>Target[@fkField]`
 * (to-one relations carry the foreign-key column, lists do not). A test
 * regenerates this from prisma/schema.prisma, so it can not drift.
 */
const RELATIONS = `
Partner: preferredByArchitect>Customer preferredByCarpenter>Customer quotationsAsArchitect>Quotation quotationsAsCarpenter>Quotation ordersAsArchitect>Order ordersAsCarpenter>Order
Customer: preferredArchitect>Partner@preferredArchitectId preferredCarpenter>Partner@preferredCarpenterId quotations>Quotation orders>Order invoices>Invoice creditDebitNotes>CreditDebitNote payments>Payment
Material: items>Item stockMovements>StockMovement purchaseOrderLines>PurchaseOrderLine purchaseBillLines>PurchaseBillLine goodsReceiptLines>GoodsReceiptLine
Item: material>Material@materialId stockMovements>StockMovement purchaseOrderLines>PurchaseOrderLine purchaseBillLines>PurchaseBillLine goodsReceiptLines>GoodsReceiptLine quotationLines>QuotationLine orderLines>OrderLine invoiceLines>InvoiceLine
Quotation: parent>Quotation@parentId revisions>Quotation customer>Customer@customerId architect>Partner@architectId carpenter>Partner@carpenterId lines>QuotationLine orders>Order attachments>QuotationAttachment shares>QuotationShare comments>QuotationComment
QuotationLine: quotation>Quotation@quotationId item>Item@itemId
Order: quotation>Quotation@quotationId customer>Customer@customerId architect>Partner@architectId carpenter>Partner@carpenterId lines>OrderLine productionTasks>ProductionTask dispatches>Dispatch invoices>Invoice expenses>Expense
OrderLine: order>Order@orderId item>Item@itemId dispatchLines>DispatchLine
ProductionStage: tasks>ProductionTask
ProductionTask: order>Order@orderId stage>ProductionStage@stageId
QuotationAttachment: quotation>Quotation@quotationId comments>QuotationComment
QuotationShare: quotation>Quotation@quotationId history>QuotationShareResponse
QuotationComment: quotation>Quotation@quotationId attachment>QuotationAttachment@attachmentId
Dispatch: order>Order@orderId lines>DispatchLine
DispatchLine: dispatch>Dispatch@dispatchId orderLine>OrderLine@orderLineId
QuotationShareResponse: share>QuotationShare@shareId
Invoice: order>Order@orderId customer>Customer@customerId lines>InvoiceLine paymentAllocations>PaymentAllocation writeOffs>InvoiceWriteOff creditDebitNotes>CreditDebitNote
InvoiceLine: invoice>Invoice@invoiceId item>Item@itemId
InvoiceWriteOff: invoice>Invoice@invoiceId
PaymentChannel: expenses>Expense payments>Payment vendorPayments>VendorPayment openingBalances>ChannelOpeningBalance
Payment: customer>Customer@customerId channel>PaymentChannel@channelId order>Order@orderId allocations>PaymentAllocation
PaymentAllocation: payment>Payment@paymentId invoice>Invoice@invoiceId
ExpenseCategory: expenses>Expense
Expense: category>ExpenseCategory@categoryId vendor>Vendor@vendorId channel>PaymentChannel@channelId order>Order@orderId
CreditDebitNote: customer>Customer@customerId invoice>Invoice@invoiceId lines>CreditDebitNoteLine
CreditDebitNoteLine: note>CreditDebitNote@noteId
Vendor: expenses>Expense purchaseOrders>PurchaseOrder purchaseBills>PurchaseBill goodsReceipts>GoodsReceipt payments>VendorPayment
PurchaseOrder: vendor>Vendor@vendorId lines>PurchaseOrderLine bills>PurchaseBill receipts>GoodsReceipt
PurchaseOrderLine: po>PurchaseOrder@poId item>Item@itemId material>Material@materialId billLines>PurchaseBillLine receiptLines>GoodsReceiptLine
PurchaseBill: vendor>Vendor@vendorId po>PurchaseOrder@poId lines>PurchaseBillLine allocations>VendorPaymentAllocation receipts>GoodsReceipt
PurchaseBillLine: bill>PurchaseBill@billId poLine>PurchaseOrderLine@poLineId item>Item@itemId material>Material@materialId receiptLines>GoodsReceiptLine
GoodsReceipt: vendor>Vendor@vendorId bill>PurchaseBill@billId po>PurchaseOrder@poId lines>GoodsReceiptLine
GoodsReceiptLine: receipt>GoodsReceipt@receiptId billLine>PurchaseBillLine@billLineId poLine>PurchaseOrderLine@poLineId item>Item@itemId material>Material@materialId
StockMovement: item>Item@itemId material>Material@materialId receiptLine>GoodsReceiptLine@receiptLineId
VendorPayment: vendor>Vendor@vendorId channel>PaymentChannel@channelId allocations>VendorPaymentAllocation
VendorPaymentAllocation: vendorPayment>VendorPayment@vendorPaymentId bill>PurchaseBill@billId
ChannelOpeningBalance: channel>PaymentChannel@channelId
`

export type Relation = { target: string; fk?: string }

export const RELATION_TABLE: Record<string, Record<string, Relation>> =
  Object.fromEntries(
    RELATIONS.trim()
      .split('\n')
      .map((line) => {
        const [model, rest] = line.split(': ')

        return [
          model,
          Object.fromEntries(
            rest.split(' ').map((entry) => {
              const [name, spec] = entry.split('>')
              const [target, fk] = spec.split('@')

              return [name, fk ? { target, fk } : { target }]
            }),
          ),
        ]
      }),
  )

/** Foreign-key column -> the table it points at, for one model. */
export function foreignKeys(model: string): Record<string, string> {
  return Object.fromEntries(
    Object.values(RELATION_TABLE[model] ?? {})
      .filter((r) => r.fk)
      .map((r) => [r.fk as string, r.target]),
  )
}

export function isCompanyOwned(model: string) {
  return SCOPED.has(model) || model in CHILD_PARENT
}

/** A `where` fragment that is true only for rows of this company. */
export function ownedBy(model: string, companyId: string): Record<string, unknown> | null {
  if (SCOPED.has(model)) return { companyId }

  const path = CHILD_PARENT[model]

  if (!path) return null

  return path.reduceRight<Record<string, unknown>>(
    (inner, relation) => ({ [relation]: inner }),
    { companyId },
  )
}

type Args = {
  where?: Record<string, unknown>
  data?: unknown
  create?: Record<string, unknown>
}

export const FILTERED = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
])

/** The companyId that matches no row; used when a person has no company. */
export const NO_COMPANY = '__no_company__'

/**
 * Narrows `args.where` to one company. A `where` that already names a
 * companyId is trusted (public links look a company up from a token).
 */
export function scopeWhere(
  model: string,
  operation: string,
  where: Record<string, unknown> | undefined,
  companyId: string,
): Record<string, unknown> | undefined {
  if (!FILTERED.has(operation)) return where

  const current = where ?? {}

  if (SCOPED.has(model)) {
    if ('companyId' in current) return current

    return model === 'ActivityLog' && operation !== 'upsert'
      ? withAnd(current, { OR: [{ companyId }, { companyId: null }] })
      : { ...current, companyId }
  }

  const owned = ownedBy(model, companyId)

  if (!owned) return where

  // Added through AND so the caller's own filter may already use the relation,
  // and kept beside the caller's unique fields (id) so a lookup by id stays a
  // valid unique lookup.
  return withAnd(current, owned)
}

function withAnd(
  current: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const existing = current.AND

  return {
    ...current,
    AND: [...(Array.isArray(existing) ? existing : existing ? [existing] : []), extra],
  }
}

/** A foreign id a write points at, which must belong to the company. */
export type Ref = { model: string; id: string }

const NESTED_OPS = ['create', 'createMany', 'connectOrCreate', 'update', 'updateMany', 'upsert']

function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

/**
 * Every foreign id a write would attach to (customerId, itemId, ... as plain
 * columns, `connect`s, and the same inside nested creates such as `lines`).
 * A `connect` that is not by id can not be checked and is reported as a ref
 * to a row that does not exist, so the write is refused.
 */
export function collectRefs(model: string, data: unknown, refs: Ref[] = []): Ref[] {
  for (const row of asArray(data)) {
    if (!isRecord(row)) continue

    const relations = RELATION_TABLE[model] ?? {}
    const fks = foreignKeys(model)

    for (const [key, value] of Object.entries(row)) {
      if (key in fks) {
        const id = isRecord(value) ? value.set : value

        if (typeof id === 'string') refs.push({ model: fks[key], id })
        continue
      }

      const relation = relations[key]

      if (!relation || !isRecord(value)) continue

      for (const target of asArray(value.connect)) {
        const id = isRecord(target) ? target.id : undefined

        refs.push({ model: relation.target, id: typeof id === 'string' ? id : '__unverifiable__' })
      }

      for (const op of NESTED_OPS) {
        for (const body of asArray(value[op] as unknown)) {
          if (!isRecord(body)) continue

          if (op === 'connectOrCreate') {
            const id = isRecord(body.where) ? body.where.id : undefined

            refs.push({ model: relation.target, id: typeof id === 'string' ? id : '__unverifiable__' })
            collectRefs(relation.target, body.create, refs)
          } else if (op === 'upsert') {
            collectRefs(relation.target, body.create, refs)
            collectRefs(relation.target, body.update, refs)
          } else if (op === 'createMany') {
            collectRefs(relation.target, body.data, refs)
          } else if (op === 'update' || op === 'updateMany') {
            collectRefs(relation.target, 'data' in body ? body.data : body, refs)
          } else {
            collectRefs(relation.target, body, refs)
          }
        }
      }
    }
  }

  return refs
}

/** The same refs, as one list of distinct ids per target table. */
export function groupRefs(refs: Ref[]): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>()

  for (const ref of refs) {
    if (!isCompanyOwned(ref.model)) continue

    grouped.set(ref.model, (grouped.get(ref.model) ?? new Set()).add(ref.id))
  }

  return new Map([...grouped].map(([model, ids]) => [model, [...ids]]))
}

/** Where the data of a write lives, for the operations that carry data. */
export function writtenData(operation: string, args: Args): unknown[] {
  switch (operation) {
    case 'create':
    case 'createMany':
    case 'createManyAndReturn':
    case 'update':
    case 'updateMany':
      return [args.data]
    case 'upsert':
      return [args.create, (args as { update?: unknown }).update]
    default:
      return []
  }
}

/** Stamps new rows with the company they are created in. */
export function stampCreate(operation: string, args: Args, companyId: string): Args {
  const next = { ...args }

  if (operation === 'create' && next.data && !Array.isArray(next.data)) {
    next.data = { companyId, ...(next.data as object) }
  }

  if (
    (operation === 'createMany' || operation === 'createManyAndReturn') &&
    Array.isArray(next.data)
  ) {
    next.data = next.data.map((row) => ({ companyId, ...(row as object) }))
  }

  if (operation === 'upsert' && next.create) {
    next.create = { companyId, ...next.create }
  }

  return next
}
