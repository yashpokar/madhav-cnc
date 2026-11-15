import { z } from 'zod'
import { CustomerStatus, CustomerType, OrderStatus, QuotationStatus } from '@/generated/prisma/enums'
import { receiptInputSchema } from '@/lib/validation/payments'
import { expenseInputSchema } from '@/lib/validation/accounting'
import { quotationInputSchema } from '@/lib/validation/quotations'
import { orderJsonSchema } from '@/lib/validation/orders'
import { invoiceInputSchema } from '@/lib/validation/invoices'
import { customerInputSchema } from '@/lib/validation/customers'

// Request and response shapes of the v1 write endpoints. The bodies reuse the
// validation the web forms use (src/lib/validation/*), which already accepts
// JSON values, so the web and the apps can never disagree on a rule. Responses
// are the same detail shapes the read endpoints answer (see schemas/reads.ts).

export { customerInputSchema, orderJsonSchema, invoiceInputSchema }

// ---------------------------------------------------------------- customers

/** Everything optional: only the fields sent change. */
export const customerPatchBody = z
  .object({
    name: z.string(),
    type: z.enum(CustomerType),
    status: z.enum(CustomerStatus),
    phone: z.string(),
    altPhone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
    gstin: z.string().nullable(),
    pan: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    anniversaryDate: z.string().nullable(),
    preferredArchitectId: z.string().nullable(),
    preferredCarpenterId: z.string().nullable(),
    paymentTermsDays: z.number().int().nullable(),
    notes: z.string().nullable(),
    openingDue: z.number(),
    openingAsOf: z.string().nullable(),
  })
  .partial()

// --------------------------------------------------------------- quotations

const todayText = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/**
 * A quotation as the app sends it. The status is never part of it (a new one
 * is a draft; the status has its own endpoint) and the date defaults to today.
 */
export const quotationWriteBody = quotationInputSchema
  .omit({ status: true, quotationDate: true })
  .extend({
    quotationDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
      .default(todayText)
      .transform((value) => new Date(`${value}T00:00:00Z`)),
  })

export const quotationStatusBody = z.object({ status: z.enum(QuotationStatus) })

export const shareLinkResponse = z.object({
  url: z.string(),
  token: z.string(),
  whatsappText: z.string(),
  whatsappLink: z.string(),
  created: z.boolean().describe('False when an active link already existed and was returned as it is'),
})

// ------------------------------------------------------------------- orders

export const orderStatusBody = z.object({ status: z.enum(OrderStatus) })

// ----------------------------------------------------------------- invoices

/** Either `{ orderId }` alone (a draft from a completed order) or a full invoice. */
export const invoiceCreateDocBody = z.union([z.object({ orderId: z.string().min(1) }), invoiceInputSchema])

export const invoiceCreateBody = z.record(z.string(), z.unknown())

// ----------------------------------------------------------------- payments

/** A receipt as the app sends it: `methodId` is the payment method id from GET /payment-methods. */
export const paymentCreateBody = receiptInputSchema.omit({ channelId: true }).extend({
  methodId: z.string().trim().min(1, 'Choose a payment mode'),
  details: z.unknown().optional().describe("The method's own fields (see GET /payment-methods), as an object"),
})

// ----------------------------------------------------------------- expenses

export const expenseWriteBody = expenseInputSchema.omit({ channelId: true }).extend({
  methodId: z.string().trim().min(1, 'Choose a payment mode'),
  details: z.unknown().optional().describe("The method's own fields (see GET /payment-methods), as an object"),
  receiptUploadId: z.string().min(1).nullable().optional().describe('An uploadId from POST /uploads (purpose expense_receipt)'),
})

export const deletedResponse = z.object({ id: z.string(), deleted: z.literal(true) })

// --------------------------------------------------------------- production

export const startTaskBody = z.object({ force: z.boolean().optional().describe('Administrators only: start a stage out of order') }).default({})
export const completeTaskBody = z.object({ startNext: z.boolean().optional().describe('Also start the next pending stage (default true)') }).default({})
export const taskReasonBody = z.object({ reason: z.string().max(500).optional() }).default({})
export const assignTaskBody = z.object({ userId: z.string().min(1).nullable() })
export const taskNotesBody = z.object({ notes: z.string().max(2000) })

// ----------------------------------------------------------------- uploads

export const UPLOAD_PURPOSES = ['expense_receipt', 'payment_proof', 'quotation_attachment'] as const

export const uploadBody = z.object({
  file: z.string().describe('The file (binary). image/png, jpeg, webp, gif, heic, heif or application/pdf, at most 10 MB'),
  purpose: z.enum(UPLOAD_PURPOSES),
})

export const uploadResponse = z.object({
  uploadId: z.string(),
  url: z.string().describe('Authorised GET (bearer + X-Company-Id) that streams the file'),
  mime: z.string(),
  size: z.number().int(),
  purpose: z.enum(UPLOAD_PURPOSES),
})

// ----------------------------------------------------------------- devices

export const deviceBody = z.object({
  expoPushToken: z.string().trim().min(10).max(200).regex(/^(Expo|Exponent)PushToken\[.+\]$/, 'Not an Expo push token'),
  platform: z.enum(['ios', 'android']),
  appVersion: z.string().max(40).optional(),
  locale: z.string().max(35).optional(),
})

export const deviceResponse = z.object({
  id: z.string(),
  expoPushToken: z.string(),
  platform: z.string(),
  companyId: z.string().nullable(),
  appVersion: z.string().nullable(),
  locale: z.string().nullable(),
})
