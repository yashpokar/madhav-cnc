import { z } from 'zod'
import {
  BalanceAdjustmentKind,
  BalanceAdjustmentReason,
  DimensionUnit,
  DispatchStatus,
  ItemType,
  NoteKind,
  NoteParty,
  NoteReason,
  NoteStatus,
  PartnerType,
  PaymentMode,
  SupplyType,
  UnitOfMeasure,
} from '@/generated/prisma/enums'
import { idSchema, instant, dateOnly, money, quantity, pageQuery } from '@/lib/api/schemas/reads'
import { itemInputSchema } from '@/lib/validation/items'
import { partnerInputSchema } from '@/lib/validation/partners'
import { paymentModeSchema } from '@/lib/validation/payment-modes'
import { expenseCategorySchema, noteInputSchema } from '@/lib/validation/accounting'
import { adjustmentInputSchema } from '@/lib/validation/adjustments'
import { dispatchInputSchema, dispatchReceiptSchema } from '@/lib/validation/dispatches'
import { STAGE_LINKED_STATUSES, stageNameSchema } from '@/lib/validation/production'

// Request and response shapes of the master-data and settings endpoints:
// items, materials, partners, payment modes, expense categories, the business
// profile, production stages, balance adjustments, opening balances, credit and
// debit notes and delivery challans. Bodies reuse the web's validation.
// PATCH bodies on master records are partial: only the fields sent change (the
// rest are kept and the merged record goes through the web's own validation).

const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])

export const directionBody = z.object({ direction: z.enum(['up', 'down']) })
export const activeBody = z.object({ isActive: z.boolean() })

// -------------------------------------------------------------------- items

export const itemWriteBody = itemInputSchema

/** Everything optional: only the fields sent change (null clears an optional one). */
export const itemPatchBody = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    type: z.enum(ItemType),
    supplyType: z.enum(SupplyType),
    isFlatRate: z.boolean(),
    materialId: z.string().nullable(),
    unit: z.enum(UnitOfMeasure),
    rate: z.number(),
    brand: z.string().nullable(),
    shade: z.string().nullable(),
    dimensionUnit: z.enum(DimensionUnit),
    thickness: z.number().nullable(),
    length: z.number().nullable(),
    width: z.number().nullable(),
    hsnCode: z.string().nullable(),
    taxRatePercent: z.number(),
    isActive: z.boolean(),
    notes: z.string().nullable(),
    stockTracked: z.boolean(),
    reorderLevel: z.number().nullable(),
  })
  .partial()

// ---------------------------------------------------------------- materials

export const materialRow = z.object({
  id: idSchema,
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  stockTracked: z.boolean(),
  reorderLevel: quantity.nullable(),
  itemCount: z.number().int().describe('Items in this material'),
})

export const materialCreateBody = z.object({ name: z.string().trim().min(1, 'Material name is required').max(100) })

export const materialPatchBody = z
  .object({
    name: z.string().trim().min(1, 'Material name is required').max(100),
    isActive: z.boolean(),
    stockTracked: z.boolean(),
    reorderLevel: z.number().min(0, 'Reorder level cannot be negative').nullable(),
  })
  .partial()

// ----------------------------------------------------------------- partners

export const partnersQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional().describe('Case-insensitive search'),
  type: z.enum(PartnerType).optional(),
  includeInactive: bool.optional().describe('Also list inactive partners (default false)'),
})

export const partnerListItem = z.object({
  id: idSchema,
  code: z.string(),
  type: z.enum(PartnerType),
  name: z.string(),
  firmName: z.string().nullable(),
  phone: z.string(),
  altPhone: z.string().nullable(),
  email: z.string().nullable(),
  city: z.string().nullable(),
  pincode: z.string().nullable(),
  isActive: z.boolean(),
  updatedAt: instant,
})

export const partnerDetail = partnerListItem.extend({
  address: z.string().nullable(),
  state: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: instant,
})

export const partnerWriteBody = partnerInputSchema

export const partnerPatchBody = z
  .object({
    name: z.string(),
    firmName: z.string().nullable(),
    phone: z.string(),
    altPhone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
    isActive: z.boolean(),
    notes: z.string().nullable(),
  })
  .partial()

// ------------------------------------------------------------ payment modes

export const paymentModeRow = z.object({
  id: idSchema,
  name: z.string(),
  kind: z.enum(PaymentMode),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  details: z.array(z.object({ label: z.string(), value: z.string() })),
  accountDetails: z.record(z.string(), z.unknown()).describe('Receiving fields of the kind (UPI ID, account number, IFSC...)'),
  showOnDocuments: z.boolean(),
  hasQr: z.boolean(),
  usage: z.object({ payments: z.number().int(), expenses: z.number().int() }),
})

export const paymentModeWriteBody = paymentModeSchema

export const paymentModePatchBody = z
  .object({
    name: z.string(),
    kind: z.enum(PaymentMode),
    details: z.array(z.object({ label: z.string(), value: z.string() })),
    accountDetails: z.record(z.string(), z.unknown()),
    showOnDocuments: z.boolean(),
    isActive: z.boolean(),
  })
  .partial()

// ------------------------------------------------------- expense categories

export const expenseCategoryRow = z.object({
  id: idSchema,
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  expenseCount: z.number().int(),
})

export const expenseCategoryWriteBody = expenseCategorySchema

export const expenseCategoryPatchBody = z
  .object({ name: z.string(), sortOrder: z.number().int(), isActive: z.boolean() })
  .partial()

// --------------------------------------------------------- business profile

export const companyProfile = z.object({
  companyName: z.string(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  industry: z.string(),
  defaultAdvancePercent: z.string().describe('Percent, e.g. "80"'),
  invoiceTerms: z.string().nullable(),
  signatoryName: z.string().nullable(),
  signatoryTitle: z.string().nullable(),
  hasLogo: z.boolean(),
  hasSignature: z.boolean(),
  hasStamp: z.boolean(),
  updatedAt: instant,
})

export const companyPatchBody = z
  .object({
    companyName: z.string(),
    addressLine: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    gstin: z.string().nullable(),
    pan: z.string().nullable(),
    defaultAdvancePercent: z.number(),
    invoiceTerms: z.string().nullable(),
    signatoryName: z.string().nullable(),
    signatoryTitle: z.string().nullable(),
  })
  .partial()

export const COMPANY_ASSET_NAMES = ['logo', 'signature', 'stamp'] as const

export const companyAssetParams = z.object({ asset: z.enum(COMPANY_ASSET_NAMES) })

export const assetUploadBody = z.object({
  file: z.string().describe('The image (binary): image/png, jpeg or webp, at most 10 MB'),
})

// ------------------------------------------------------------------- stages

export const stageRow = z.object({
  id: idSchema,
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  linkedStatus: z.string().nullable().describe('The order status reached when this stage is completed'),
  taskCount: z.number().int(),
})

export const stageCreateBody = z.object({ name: stageNameSchema })

export const stagePatchBody = z
  .object({
    name: stageNameSchema,
    isActive: z.boolean(),
    linkedStatus: z.enum(STAGE_LINKED_STATUSES).nullable(),
  })
  .partial()

// -------------------------------------------------------------- adjustments

export const adjustmentsQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional().describe('Case-insensitive search'),
  kind: z.enum(BalanceAdjustmentKind).optional(),
  reason: z.enum(BalanceAdjustmentReason).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const adjustmentItem = z.object({
  id: idSchema,
  number: z.string(),
  kind: z.enum(BalanceAdjustmentKind),
  amount: money.describe('Signed: negative takes money out (mode) or lowers what the customer owes'),
  adjustedOn: dateOnly,
  reason: z.enum(BalanceAdjustmentReason),
  note: z.string(),
  channel: z.object({ id: idSchema, name: z.string() }).nullable(),
  customer: z.object({ id: idSchema, name: z.string() }).nullable(),
  createdAt: instant,
})

export const adjustmentWriteBody = adjustmentInputSchema

// --------------------------------------------------------- opening balances

export const openingBalanceRow = z.object({
  channelId: idSchema,
  name: z.string(),
  isActive: z.boolean(),
  amount: money.nullable().describe('Signed; null when none was entered'),
  asOf: dateOnly.nullable(),
})

export const openingBalancesBody = z.object({
  balances: z
    .array(
      z.object({
        channelId: z.string().min(1),
        amount: z.number().nullable().describe('Negative for an overdraft; null removes the entry'),
        asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').nullable().describe('Required when an amount is sent'),
      }),
    )
    .max(200),
})

// -------------------------------------------------------------------- notes

export const notesQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional().describe('Case-insensitive search'),
  kind: z.enum(NoteKind).optional(),
  status: z.enum(NoteStatus).optional(),
})

export const noteListItem = z.object({
  id: idSchema,
  number: z.string(),
  kind: z.enum(NoteKind),
  status: z.enum(NoteStatus),
  partyType: z.enum(NoteParty),
  reason: z.enum(NoteReason),
  noteDate: dateOnly,
  total: money,
  taxAmount: money,
  vendorName: z.string().nullable(),
  customer: z.object({ id: idSchema, name: z.string() }).nullable(),
  invoice: z.object({ id: idSchema, number: z.string() }).nullable(),
})

export const noteDetail = noteListItem.extend({
  vendorGstin: z.string().nullable(),
  placeOfSupply: z.string().nullable(),
  isInterState: z.boolean(),
  reasonNote: z.string().nullable(),
  subtotal: money,
  taxableAmount: money,
  cgstAmount: money,
  sgstAmount: money,
  igstAmount: money,
  roundOff: money,
  lines: z.array(
    z.object({
      id: idSchema,
      position: z.number().int(),
      description: z.string(),
      hsnCode: z.string().nullable(),
      unit: z.string(),
      quantity: quantity,
      rate: money,
      taxRatePercent: money,
      amount: money,
      cgstAmount: money,
      sgstAmount: money,
      igstAmount: money,
      lineTotal: money,
    }),
  ),
  createdAt: instant,
  updatedAt: instant,
})

export const noteWriteBody = noteInputSchema
export const noteStatusBody = z.object({ status: z.enum(NoteStatus) })

// -------------------------------------------------------------- dispatches

export const dispatchesQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional().describe('Case-insensitive search'),
  status: z.enum(DispatchStatus).optional(),
})

export const dispatchListItem = z.object({
  id: idSchema,
  number: z.string(),
  status: z.enum(DispatchStatus),
  dispatchDate: dateOnly,
  vehicleNumber: z.string().nullable(),
  receivedByName: z.string().nullable(),
  receivedAt: instant.nullable(),
  order: z.object({ id: idSchema, number: z.string(), customerName: z.string() }),
  lineCount: z.number().int(),
  createdAt: instant,
})

export const dispatchDetail = dispatchListItem.extend({
  driverName: z.string().nullable(),
  driverPhone: z.string().nullable(),
  transporterName: z.string().nullable(),
  lrNumber: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
  deliveryCity: z.string().nullable(),
  deliveryPincode: z.string().nullable(),
  notes: z.string().nullable(),
  deliveredAt: instant.nullable(),
  order: z.object({
    id: idSchema,
    number: z.string(),
    customerName: z.string(),
    subject: z.string().nullable(),
  }),
  lines: z.array(
    z.object({
      id: idSchema,
      position: z.number().int(),
      orderLineId: z.string().nullable(),
      description: z.string(),
      unit: z.string(),
      quantity: quantity,
    }),
  ),
  updatedAt: instant,
})

export const dispatchWriteBody = dispatchInputSchema
export const dispatchStatusBody = z.object({ status: z.enum(DispatchStatus) })
export const dispatchReceiptBody = dispatchReceiptSchema

export const dispatchableOrder = z.object({
  id: idSchema,
  number: z.string(),
  subject: z.string().nullable(),
  status: z.string(),
  dueDate: dateOnly.nullable(),
  customerName: z.string(),
})

export const dispatchableOrderDetail = z.object({
  id: idSchema,
  number: z.string(),
  subject: z.string().nullable(),
  status: z.string(),
  siteAddress: z.string().nullable(),
  siteCity: z.string().nullable(),
  sitePincode: z.string().nullable(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  lines: z.array(
    z.object({
      id: idSchema,
      position: z.number().int(),
      description: z.string(),
      unit: z.string(),
      ordered: quantity,
      dispatched: quantity,
      remaining: quantity,
    }),
  ),
})
