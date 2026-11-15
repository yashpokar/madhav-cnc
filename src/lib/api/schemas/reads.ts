import { z } from 'zod'
import {
  CustomerStatus,
  DimensionUnit,
  InvoiceStatus,
  ItemType,
  MaterialSupply,
  OrderStatus,
  PaymentMode,
  ProductionTaskStatus,
  QuotationStatus,
} from '@/generated/prisma/enums'
import { DEFAULT_LIMIT, MAX_LIMIT } from '@/lib/api/cursor'

// The read endpoints' request and response shapes (pure zod, shared by the route
// handlers, the mappers in src/lib/api/reads, the OpenAPI generator and tests).
// Money is a decimal string ("12345.50"), dates are ISO 8601 (date-only for calendar
// days), ids are cuid strings and enums use the upstream names.

export const money = z.string().describe('Decimal string with two places, e.g. "12345.50"')
export const quantity = z.string().describe('Decimal string, e.g. "2.5"')
export const dateOnly = z.string().describe('ISO date, e.g. "2026-11-15"')
export const instant = z.string().describe('ISO 8601 timestamp, e.g. "2026-11-15T09:30:00.000Z"')
export const idSchema = z.string().describe('cuid')

const idParam = z.object({ id: z.string().min(1).max(64) })

export const idParams = idParam

/** `?limit=&cursor=` shared by every list. */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().min(1).max(500).optional(),
})

const search = z.string().trim().max(100).optional().describe('Case-insensitive search')

export const listMeta = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
})

const partnerRef = z.object({ id: idSchema, name: z.string() })

// ---------------------------------------------------------------- customers

export const customersQuery = pageQuery.extend({
  q: search,
  status: z.enum(CustomerStatus).optional(),
})

export const customerListItem = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.enum(CustomerStatus),
  phone: z.string(),
  email: z.string().nullable(),
  city: z.string().nullable(),
  preferredArchitect: partnerRef.nullable(),
  preferredCarpenter: partnerRef.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

export const customerAccountSummary = z.object({
  outstanding: money.describe('What the customer owes now (open invoices + opening balance + adjustments)'),
  invoiceDue: money,
  opening: money,
  onAccount: money.describe('Receipts taken but not applied to an invoice'),
  credit: money,
  creditNotes: money,
  net: money,
  openInvoices: z.array(
    z.object({
      id: idSchema,
      number: z.string(),
      invoiceDate: dateOnly,
      dueDate: dateOnly.nullable(),
      total: money,
      due: money,
    }),
  ),
})

export const customerDetail = customerListItem.extend({
  altPhone: z.string().nullable(),
  address: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  dateOfBirth: dateOnly.nullable(),
  anniversaryDate: dateOnly.nullable(),
  paymentTermsDays: z.number().int().nullable(),
  notes: z.string().nullable(),
  openingDue: money,
  openingAsOf: dateOnly.nullable(),
  account: customerAccountSummary
    .nullable()
    .describe('Null when the role may not read invoices (needs invoice:read)'),
})

// -------------------------------------------------------------------- items

export const itemsQuery = pageQuery.extend({
  q: search,
  type: z.enum(ItemType).optional(),
})

export const itemListItem = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  type: z.enum(ItemType),
  supplyType: z.string(),
  isFlatRate: z.boolean(),
  unit: z.string(),
  rate: money,
  taxRatePercent: z.string().describe('Decimal string, e.g. "18.00"'),
  brand: z.string().nullable(),
  dimensionUnit: z.enum(DimensionUnit),
  thickness: quantity.nullable(),
  isActive: z.boolean(),
  material: partnerRef.nullable(),
  updatedAt: instant,
})

export const itemDetail = itemListItem.extend({
  description: z.string().nullable(),
  shade: z.string().nullable(),
  length: quantity.nullable(),
  width: quantity.nullable(),
  hsnCode: z.string().nullable(),
  notes: z.string().nullable(),
  stockTracked: z.boolean(),
  purchaseRate: money.nullable().describe('Null unless the role has purchase:read'),
  reorderLevel: quantity.nullable(),
  createdAt: instant,
})

// ------------------------------------------------------------ document lines

const line = z.object({
  id: idSchema,
  position: z.number().int(),
  itemId: idSchema.nullable(),
  description: z.string(),
  unit: z.string(),
  materialSupply: z.enum(MaterialSupply),
  isFlatRate: z.boolean(),
  dimensionUnit: z.enum(DimensionUnit).nullable(),
  length: quantity.nullable(),
  width: quantity.nullable(),
  pieces: quantity.nullable(),
  quantity,
  rate: money,
  discountPercent: z.string(),
  taxRatePercent: z.string(),
  amount: money,
  taxAmount: money,
  lineTotal: money,
})

export const documentTotals = z.object({
  discountType: z.string(),
  discountValue: money,
  subtotal: money,
  discountAmount: money,
  taxableAmount: money,
  taxAmount: money,
  roundOff: money,
  total: money,
})

// ---------------------------------------------------------------- quotations

export const quotationsQuery = pageQuery.extend({
  q: search,
  status: z.enum(QuotationStatus).optional(),
})

export const quotationListItem = z.object({
  id: idSchema,
  number: z.string(),
  revision: z.number().int(),
  status: z.enum(QuotationStatus),
  subject: z.string().nullable(),
  quotationDate: dateOnly,
  validUntil: dateOnly.nullable(),
  total: money,
  materialSummary: z.enum(['WITH', 'WITHOUT', 'MIXED', 'NONE']),
  lineCount: z.number().int(),
  customer: z.object({ id: idSchema, code: z.string(), name: z.string() }),
  architect: z.string().nullable().describe('Architect name'),
  carpenter: z.string().nullable().describe('Carpenter name'),
  updatedAt: instant,
})

export const quotationDetail = quotationListItem.extend({
  siteAddress: z.string().nullable(),
  siteCity: z.string().nullable(),
  sitePincode: z.string().nullable(),
  advancePercent: z.string(),
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  totals: documentTotals,
  lines: z.array(line),
  order: z.object({ id: idSchema, number: z.string() }).nullable().describe('The order it was converted to, if any'),
  share: z
    .object({
      hasLink: z.boolean(),
      decision: z.string().nullable(),
      viewCount: z.number().int(),
      lastViewedAt: instant.nullable(),
      respondedAt: instant.nullable(),
      respondedByName: z.string().nullable(),
      responseNote: z.string().nullable(),
    })
    .describe('State of the existing customer link; reading never creates one'),
  createdAt: instant,
})

// -------------------------------------------------------------------- orders

export const ordersQuery = pageQuery.extend({
  q: search,
  status: z.enum(OrderStatus).optional(),
})

export const orderListItem = z.object({
  id: idSchema,
  number: z.string(),
  status: z.enum(OrderStatus),
  subject: z.string().nullable(),
  orderDate: dateOnly,
  dueDate: dateOnly.nullable(),
  startsAt: instant.nullable(),
  endsAt: instant.nullable(),
  total: money,
  advanceAmount: money,
  balance: money.describe('total minus the advance taken'),
  materialSummary: z.enum(['WITH', 'WITHOUT', 'MIXED', 'NONE']),
  lineCount: z.number().int(),
  customer: z.object({ id: idSchema, code: z.string(), name: z.string() }),
  architect: z.string().nullable(),
  quotation: z.object({ id: idSchema, number: z.string() }).nullable(),
  updatedAt: instant,
})

export const orderDetail = orderListItem.extend({
  customerPoNumber: z.string().nullable(),
  venue: z.string().nullable(),
  headcount: z.number().int().nullable(),
  siteAddress: z.string().nullable(),
  siteCity: z.string().nullable(),
  sitePincode: z.string().nullable(),
  transportCharge: money,
  transportTaxRatePercent: z.string(),
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  totals: documentTotals,
  lines: z.array(line),
  carpenter: z.string().nullable(),
  createdAt: instant,
})

// ------------------------------------------------------------------ invoices

export const invoicesQuery = pageQuery.extend({
  q: search,
  status: z.enum(InvoiceStatus).optional(),
})

export const paymentState = z.enum(['UNPAID', 'PART_PAID', 'PAID', 'WRITTEN_OFF'])

export const invoiceListItem = z.object({
  id: idSchema,
  number: z.string(),
  status: z.enum(InvoiceStatus),
  invoiceDate: dateOnly,
  dueDate: dateOnly.nullable(),
  total: money,
  advanceAdjusted: money,
  paid: money,
  writtenOff: money,
  due: money,
  paymentState,
  isOverdue: z.boolean(),
  isInterState: z.boolean(),
  customer: z.object({ id: idSchema, name: z.string() }),
  order: z.object({ id: idSchema, number: z.string() }).nullable(),
  updatedAt: instant,
})

export const invoiceLine = z.object({
  id: idSchema,
  position: z.number().int(),
  description: z.string(),
  hsnCode: z.string().nullable(),
  unit: z.string(),
  quantity,
  rate: money,
  discountPercent: z.string(),
  taxRatePercent: z.string(),
  amount: money,
  cgstAmount: money,
  sgstAmount: money,
  igstAmount: money,
  lineTotal: money,
})

export const invoiceDetail = invoiceListItem.extend({
  placeOfSupply: z.string().nullable(),
  billingAddress: z.string().nullable(),
  customerGstin: z.string().nullable(),
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  gst: z.object({
    taxableAmount: money,
    cgstAmount: money,
    sgstAmount: money,
    igstAmount: money,
    taxAmount: money,
  }),
  totals: documentTotals.extend({ transportCharge: money }),
  lines: z.array(invoiceLine),
  payments: z.array(
    z.object({
      paymentId: idSchema,
      number: z.string(),
      paidOn: dateOnly,
      mode: z.enum(PaymentMode),
      reference: z.string().nullable(),
      amount: money.describe('Applied to this invoice'),
    }),
  ),
  writeOffs: z.array(
    z.object({ id: idSchema, amount: money, reason: z.string(), writtenOffOn: dateOnly }),
  ),
  createdAt: instant,
})

// ------------------------------------------------------------------ payments

export const paymentsQuery = pageQuery.extend({
  q: search,
  mode: z.enum(PaymentMode).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})

export const paymentListItem = z.object({
  id: idSchema,
  number: z.string(),
  paidOn: dateOnly,
  amount: money,
  mode: z.enum(PaymentMode),
  modeName: z.string().nullable(),
  reference: z.string().nullable(),
  isAdvance: z.boolean().describe('An order advance (never applied to invoices)'),
  customer: z.object({ id: idSchema, name: z.string() }),
  updatedAt: instant.describe('Receipts have no edit stamp; this is when it was recorded'),
})

export const paymentDetail = paymentListItem.extend({
  notes: z.string().nullable(),
  paymentDetails: z.record(z.string(), z.unknown()).nullable().describe('Method-specific fields (see /payment-methods)'),
  allocated: money,
  openingApplied: money,
  unallocated: money,
  orderId: idSchema.nullable(),
  allocations: z.array(
    z.object({
      id: idSchema,
      amount: money,
      invoice: z.object({ id: idSchema, number: z.string(), total: money }),
    }),
  ),
  createdAt: instant,
})

// ------------------------------------------------------------------ expenses

export const expensesQuery = pageQuery.extend({
  q: search,
  categoryId: z.string().max(64).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})

export const expenseListItem = z.object({
  id: idSchema,
  number: z.string(),
  expenseDate: dateOnly,
  payeeName: z.string(),
  description: z.string().nullable(),
  amount: money,
  taxAmount: money,
  total: money,
  isInputCredit: z.boolean(),
  paymentMode: z.enum(PaymentMode),
  modeName: z.string().nullable(),
  reference: z.string().nullable(),
  billNumber: z.string().nullable(),
  category: partnerRef.nullable(),
  order: z.object({ id: idSchema, number: z.string() }).nullable(),
  updatedAt: instant,
})

export const expenseDetail = expenseListItem.extend({
  taxRatePercent: z.string(),
  vendorGstin: z.string().nullable(),
  notes: z.string().nullable(),
  paymentDetails: z.record(z.string(), z.unknown()).nullable(),
  receiptUploadId: idSchema.nullable().describe('The uploaded bill photo (GET /uploads/{id})'),
  createdAt: instant,
})

// ------------------------------------------------------------------ calendar

export const CALENDAR_LAYERS = ['orders', 'deliveries', 'invoices', 'payments'] as const

export const calendarQuery = z.object({
  from: z.iso.date().describe('First day, inclusive (India date)'),
  to: z.iso.date().describe('Last day, exclusive (India date); at most 62 days after from'),
  layers: z
    .string()
    .optional()
    .describe('Comma list of orders,deliveries,invoices,payments (default: every layer the role may see)'),
  includeCancelled: z.enum(['true', 'false']).optional(),
})

export const calendarResponse = z.object({
  from: dateOnly,
  to: dateOnly,
  layers: z.array(z.string()),
  items: z.array(
    z
      .object({ kind: z.enum(['order', 'delivery', 'invoice', 'payments']), id: z.string() })
      .catchall(z.unknown())
      .describe(
        'order: {number,status,customerName,startsAt,endsAt,dueDate,orderDate,total,received,balance,...}; ' +
          'delivery: {dispatchId,number,status,event,orderId,orderNumber,customerName,startsAt,dueDate}; ' +
          'invoice: {number,customerName,total,due,dueDate}; payments: {day,count,total,payments[]}. Money is a decimal string.',
      ),
  ),
})

// ---------------------------------------------------------------- production

export const productionTasksQuery = pageQuery.extend({
  q: search,
  status: z.enum(ProductionTaskStatus).optional(),
})

export const productionTask = z.object({
  id: idSchema,
  status: z.enum(ProductionTaskStatus),
  position: z.number().int(),
  startedAt: instant.nullable(),
  completedAt: instant.nullable(),
  notes: z.string().nullable(),
  stage: z.object({ id: idSchema, name: z.string(), sortOrder: z.number().int() }),
  assignee: partnerRef.nullable(),
  order: z.object({
    id: idSchema,
    number: z.string(),
    status: z.enum(OrderStatus),
    subject: z.string().nullable(),
    dueDate: dateOnly.nullable(),
    customerName: z.string(),
  }),
  updatedAt: instant,
})

// ----------------------------------------------------------- reference data

export const paymentMethodField = z.object({
  key: z.string(),
  label: z.string(),
  labelOut: z.string().optional(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  required: z.boolean(),
  type: z.enum(['text', 'select', 'date']),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  pattern: z.string().optional().describe('JavaScript RegExp source to validate the value'),
  patternMessage: z.string().optional(),
  maxLength: z.number().int(),
  inputMode: z.enum(['text', 'numeric', 'email', 'tel']).optional(),
})

export const paymentMethodItem = z.object({
  id: idSchema,
  name: z.string().describe('How the company names it, e.g. "PhonePe"'),
  kind: z.enum(PaymentMode),
  label: z.string().describe('Name of the method kind, e.g. "UPI"'),
  primaryField: z.string().nullable().describe('Key of the field stored as the receipt reference'),
  fields: z.array(paymentMethodField),
  fieldsOut: z.array(paymentMethodField).describe('Labels when paying out (expenses, vendor payments)'),
})

export const expenseCategoryItem = z.object({
  id: idSchema,
  name: z.string(),
  sortOrder: z.number().int(),
})

export const statesResponse = z.array(
  z.object({
    name: z.string(),
    code: z.string(),
    gstCode: z.string(),
    isUnionTerritory: z.boolean(),
    cities: z.array(z.string()),
  }),
)

// ----------------------------------------------------------------- dashboard

const bookingRef = z.object({
  id: idSchema,
  number: z.string(),
  status: z.enum(OrderStatus),
  customerName: z.string(),
  venue: z.string().nullable(),
  startsAt: instant.nullable(),
  dueDate: dateOnly.nullable(),
})

export const dashboardSummary = z.object({
  currency: z.literal('INR'),
  asOf: dateOnly.describe('Today, India time'),
  month: z.object({ from: dateOnly, to: dateOnly }),
  receivables: z
    .object({
      outstanding: money,
      overdue: money,
      totalDue: money.describe('Billed-and-open plus delivered-not-yet-billed'),
    })
    .nullable()
    .describe('Needs invoice:read'),
  billedThisMonth: z.object({ total: money, count: z.number().int() }).nullable().describe('Needs invoice:read'),
  paymentsReceivedThisMonth: z
    .object({ total: money, count: z.number().int() })
    .nullable()
    .describe('Needs invoice:read'),
  expensesThisMonth: z.object({ total: money }).nullable().describe('Needs expense:read'),
  bookings: z
    .object({
      today: z.array(bookingRef),
      next7Days: z.object({ count: z.number().int(), items: z.array(bookingRef).describe('The first 20, in date order') }),
    })
    .nullable()
    .describe('Needs order:read'),
  orders: z
    .object({
      open: z.number().int(),
      overdue: z.number().int(),
      dueSoon: z.number().int().describe('Open orders due in the next 7 days'),
      readyToDispatch: z.number().int(),
    })
    .nullable()
    .describe('Needs order:read'),
  lowStockCount: z.number().int().nullable().describe('Needs stock:read'),
  payablesTotal: money.nullable().describe('Needs purchase:read'),
})
