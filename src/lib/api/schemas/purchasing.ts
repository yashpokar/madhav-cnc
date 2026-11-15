import { z } from 'zod'
import { GoodsReceiptStatus, PaymentMode, PurchaseBillStatus, PurchaseOrderStatus, UnitOfMeasure } from '@/generated/prisma/enums'
import { dateOnly, idSchema, instant, listMeta, money, pageQuery, quantity } from '@/lib/api/schemas/reads'
import { billInputSchema, orderInputSchema } from '@/lib/validation/purchases'
import { vendorInputSchema } from '@/lib/validation/vendors'
import { vendorPaymentInputSchema } from '@/lib/validation/vendor-payments'

// Request and response shapes of the purchasing and stock endpoints. Bodies
// reuse the validation the web forms use (src/lib/validation/*). Money is a
// decimal string, quantities a decimal string, days YYYY-MM-DD.

export { listMeta }

const search = z.string().trim().max(100).optional().describe('Case-insensitive search')
const ref = z.object({ id: idSchema, name: z.string() })
const numberRef = z.object({ id: idSchema, number: z.string() })

// ------------------------------------------------------------------ vendors

export const vendorsQuery = pageQuery.extend({
  q: search,
  includeInactive: z.enum(['true', 'false']).optional().describe('Inactive vendors are left out unless "true"'),
})

export const vendorListItem = z.object({
  id: idSchema,
  name: z.string(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  gstin: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  openingPayable: money,
  openingAsOf: dateOnly.nullable(),
  spent: money.describe('Expenses paid to this vendor'),
  expenseCount: z.number().int(),
  lastPaidOn: dateOnly.nullable(),
  updatedAt: instant,
})

export const vendorDetail = vendorListItem.extend({
  createdAt: instant,
  recentExpenses: z.array(
    z.object({
      id: idSchema,
      number: z.string(),
      expenseDate: dateOnly,
      description: z.string().nullable(),
      modeName: z.string().nullable(),
      total: money,
    }),
  ),
})

export const vendorWriteBody = vendorInputSchema

export const vendorStatement = z.object({
  vendor: z.object({ id: idSchema, name: z.string(), phone: z.string().nullable(), gstin: z.string().nullable() }),
  openingPayable: money,
  openingAsOf: dateOnly.nullable(),
  openingLeft: money,
  billsDue: money,
  due: money.describe('Open bills plus what is left of the opening payable'),
  advance: money,
  overdue: money,
  net: money.describe('Closing balance of the statement'),
  openBills: z.array(
    z.object({
      id: idSchema,
      number: z.string(),
      vendorBillNumber: z.string().nullable(),
      billDate: dateOnly,
      dueDate: dateOnly.nullable(),
      total: money,
      paid: money,
      due: money,
      status: z.string(),
    }),
  ),
  entries: z.array(
    z.object({
      id: idSchema.nullable().describe('The bill or payment; null for the opening row'),
      kind: z.enum(['opening', 'bill', 'payment']),
      date: dateOnly,
      label: z.string(),
      detail: z.string(),
      debit: money,
      credit: money,
      balance: money,
    }),
  ),
})

export const payablesResponse = z.object({
  totalPayable: money,
  billsDue: money,
  openingTotal: money,
  overdue: money,
  advances: money,
  openBillCount: z.number().int(),
  aging: z.array(z.object({ key: z.string(), label: z.string(), amount: money, count: z.number().int() })),
  vendors: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      billed: money,
      paid: money,
      billDue: money,
      opening: money,
      due: money,
      overdue: money,
      oldestDays: z.number().int(),
      advance: money,
      openBills: z.number().int(),
    }),
  ),
})

// ----------------------------------------------------------- purchase orders

export const purchaseOrdersQuery = pageQuery.extend({ q: search, status: z.enum(PurchaseOrderStatus).optional() })

export const purchaseOrderListItem = z.object({
  id: idSchema,
  number: z.string(),
  status: z.enum(PurchaseOrderStatus),
  orderDate: dateOnly,
  expectedDate: dateOnly.nullable(),
  vendor: ref,
  total: money,
  lineCount: z.number().int(),
  updatedAt: instant,
})

export const purchaseOrderLineOut = z.object({
  id: idSchema,
  itemId: idSchema.nullable(),
  materialId: idSchema.nullable(),
  description: z.string(),
  qty: quantity,
  receivedQty: quantity,
  unit: z.enum(UnitOfMeasure),
  rate: money,
  taxRatePercent: z.string(),
  lineTotal: money,
})

export const purchaseOrderDetail = purchaseOrderListItem.extend({
  notes: z.string().nullable(),
  lines: z.array(purchaseOrderLineOut),
  bills: z.array(z.object({ id: idSchema, number: z.string(), status: z.enum(PurchaseBillStatus), total: money })),
  createdAt: instant,
})

export const purchaseOrderWriteBody = orderInputSchema

export const purchaseOrderStatusBody = z.object({ status: z.enum(PurchaseOrderStatus) })

// ------------------------------------------------------------ purchase bills

export const purchaseBillsQuery = pageQuery.extend({ q: search, status: z.enum(PurchaseBillStatus).optional() })

const paymentState = z.string().nullable().describe('For a posted bill: UNPAID, PARTIAL, PAID or OVERDUE; null otherwise')

export const purchaseBillListItem = z.object({
  id: idSchema,
  number: z.string(),
  vendorBillNumber: z.string().nullable(),
  status: z.enum(PurchaseBillStatus),
  billDate: dateOnly,
  dueDate: dateOnly.nullable(),
  isInterState: z.boolean(),
  total: money,
  paid: money,
  due: money,
  paymentStatus: paymentState,
  vendor: ref,
  purchaseOrder: numberRef.nullable(),
  updatedAt: instant,
})

export const purchaseBillLineOut = z.object({
  id: idSchema,
  poLineId: idSchema.nullable(),
  itemId: idSchema.nullable(),
  materialId: idSchema.nullable(),
  description: z.string(),
  hsnCode: z.string().nullable(),
  qty: quantity,
  unit: z.enum(UnitOfMeasure),
  rate: money,
  discount: money,
  taxRatePercent: z.string(),
  taxable: money,
  taxAmount: money,
  lineTotal: money,
})

export const purchaseBillDetail = purchaseBillListItem.extend({
  notes: z.string().nullable(),
  subtotal: money,
  discount: money,
  taxableAmount: money,
  cgst: money,
  sgst: money,
  igst: money,
  taxAmount: money,
  roundOff: money,
  lines: z.array(purchaseBillLineOut),
  payments: z.array(
    z.object({
      id: idSchema,
      paymentId: idSchema,
      number: z.string(),
      paidOn: dateOnly,
      modeName: z.string().nullable(),
      reference: z.string().nullable(),
      amount: money,
    }),
  ),
  receipts: z.array(z.object({ id: idSchema, number: z.string(), status: z.enum(GoodsReceiptStatus), receivedOn: dateOnly })),
  createdAt: instant,
})

export const purchaseBillWriteBody = billInputSchema

export const purchaseBillStatusBody = z.object({
  status: z.enum(PurchaseBillStatus),
  receiveNow: z.boolean().optional().describe('With POSTED: also receive the goods (needs stock:create as well)'),
})

// ------------------------------------------------------------ goods receipts

export const goodsReceiptsQuery = pageQuery.extend({ q: search, status: z.enum(GoodsReceiptStatus).optional() })

export const goodsReceiptListItem = z.object({
  id: idSchema,
  number: z.string(),
  status: z.enum(GoodsReceiptStatus),
  receivedOn: dateOnly,
  vendor: ref,
  bill: numberRef.nullable(),
  purchaseOrder: numberRef.nullable(),
  lineCount: z.number().int(),
  updatedAt: instant,
})

export const goodsReceiptDetail = goodsReceiptListItem.extend({
  notes: z.string().nullable(),
  lines: z.array(
    z.object({
      id: idSchema,
      itemId: idSchema.nullable(),
      materialId: idSchema.nullable(),
      name: z.string(),
      code: z.string().nullable(),
      unit: z.string().nullable(),
      qty: quantity,
      unitCost: z.string().describe('Decimal string, four places'),
      tracked: z.boolean().describe('Whether it added to stock'),
    }),
  ),
  createdAt: instant,
})

export const receivableQuery = z
  .object({ billId: z.string().min(1).optional(), poId: z.string().min(1).optional() })
  .refine((q) => Boolean(q.billId) !== Boolean(q.poId), { message: 'Send billId or poId (one of them)' })

export const receivableResponse = z.object({
  number: z.string(),
  vendor: ref,
  billId: idSchema.nullable(),
  poId: idSchema.nullable(),
  lines: z.array(
    z.object({
      lineId: idSchema.describe('Send this as lineId in POST /goods-receipts'),
      itemId: idSchema.nullable(),
      materialId: idSchema.nullable(),
      description: z.string(),
      unit: z.string(),
      ordered: quantity,
      received: quantity,
      remaining: quantity,
      unitCost: z.string(),
      tracked: z.boolean(),
    }),
  ),
})

export const goodsReceiptCreateBody = z
  .object({
    billId: z.string().trim().min(1).optional(),
    poId: z.string().trim().min(1).optional(),
    receivedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date the goods arrived')
      .transform((value) => new Date(`${value}T00:00:00Z`)),
    notes: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((value) => value || null),
    lines: z
      .array(z.object({ lineId: z.string().min(1), qty: z.coerce.number().min(0).max(99_999_999) }))
      .max(500)
      .describe('Quantities per line of GET /goods-receipts/receivable'),
  })
  .refine((body) => Boolean(body.billId) !== Boolean(body.poId), {
    message: 'Choose a purchase order or a bill to receive against (one of them)',
    path: ['billId'],
  })

export const goodsReceiptCancelBody = z
  .object({ allowNegative: z.boolean().optional().describe('Administrators only: cancel even if stock would go below zero') })
  .default({})

// ----------------------------------------------------------- vendor payments

export const vendorPaymentsQuery = pageQuery.extend({
  q: search,
  mode: z.enum(PaymentMode).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})

export const vendorPaymentListItem = z.object({
  id: idSchema,
  number: z.string(),
  paidOn: dateOnly,
  amount: money,
  allocated: money,
  openingApplied: money,
  advance: money,
  mode: z.enum(PaymentMode),
  modeName: z.string().nullable(),
  reference: z.string().nullable(),
  vendor: ref,
  billNumbers: z.array(z.string()),
  updatedAt: instant,
})

export const vendorPaymentDetail = vendorPaymentListItem.omit({ billNumbers: true }).extend({
  notes: z.string().nullable(),
  paymentDetails: z.record(z.string(), z.unknown()).nullable(),
  openingLeft: money.describe('Opening payable this payment could still settle'),
  allocations: z.array(
    z.object({
      id: idSchema,
      amount: money,
      bill: z.object({
        id: idSchema,
        number: z.string(),
        vendorBillNumber: z.string().nullable(),
        billDate: dateOnly,
        dueDate: dateOnly.nullable(),
        total: money,
      }),
    }),
  ),
  createdAt: instant,
})

/** A vendor payment as the app sends it: `methodId` is the payment method id from GET /payment-methods. */
export const vendorPaymentCreateBody = vendorPaymentInputSchema
  .omit({ channelId: true, paymentDetails: true })
  .extend({
    methodId: z.string().trim().min(1, 'Choose a payment mode'),
    details: z.unknown().optional().describe("The method's own fields (see GET /payment-methods), as an object"),
  })

export const vendorAllocationsBody = z.object({
  allocations: z.array(z.object({ billId: z.string().trim().min(1), amount: z.coerce.number().min(0).max(99_999_999) })),
  openingApplied: z.coerce.number().min(0).max(99_999_999).default(0),
})

// --------------------------------------------------------------------- stock

const STOCK_FILTERS = ['all', 'low', 'out', 'negative'] as const

export const stockQuery = pageQuery.extend({ q: search, filter: z.enum(STOCK_FILTERS).optional() })

const stockKind = z.enum(['item', 'material'])

export const stockListItem = z.object({
  kind: stockKind,
  id: idSchema,
  name: z.string(),
  code: z.string().nullable(),
  unit: z.string().nullable(),
  onHand: quantity,
  averageCost: z.string(),
  value: money,
  reorderLevel: quantity.nullable(),
  state: z.enum(['negative', 'out', 'low', 'ok']),
})

export const stockLedger = z.object({
  subject: z.object({
    kind: stockKind,
    id: idSchema,
    name: z.string(),
    code: z.string().nullable(),
    unit: z.string().nullable(),
    stockTracked: z.boolean(),
    reorderLevel: quantity.nullable(),
  }),
  onHand: quantity,
  averageCost: z.string(),
  value: money,
  hasOpening: z.boolean(),
  movements: z.array(
    z.object({
      id: idSchema,
      type: z.string(),
      date: dateOnly,
      qty: quantity,
      unitCost: z.string(),
      balance: quantity,
      reference: z.string().nullable(),
      note: z.string().nullable(),
      receiptId: idSchema.nullable(),
    }),
  ),
})

const target = { kind: stockKind, id: z.string().trim().min(1) }

export const stockAdjustBody = z.object({
  ...target,
  qty: z.number().refine((n) => n !== 0, 'Enter a quantity to add (+) or remove (-)').describe('Signed: + adds, - removes'),
  reason: z.string().trim().min(1, 'A reason is required').max(300),
  date: z.iso.date().optional(),
  allowNegative: z.boolean().optional().describe('Administrators only: allow stock below zero'),
})

export const stockOpeningBody = z.object({
  ...target,
  qty: z.number().gt(0, 'Opening quantity must be more than zero'),
  unitCost: z.number().min(0, 'Cost cannot be negative'),
  date: z.iso.date().optional(),
})

export const stockResultResponse = z.object({
  kind: stockKind,
  id: idSchema,
  onHand: quantity,
})

export const reorderLevelBody = z.object({
  reorderLevel: z.number().min(0).max(99_999_999).nullable().describe('null clears the level'),
})

export const kindParams = z.object({ kind: stockKind, id: z.string().min(1).max(64) })

export const reorderLevelResponse = z.object({
  kind: stockKind,
  id: idSchema,
  reorderLevel: quantity.nullable(),
})
