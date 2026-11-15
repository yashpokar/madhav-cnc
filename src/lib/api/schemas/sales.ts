import { z } from 'zod'
import { WriteOffReason } from '@/generated/prisma/enums'
import { allocationSchema } from '@/lib/validation/payments'
import { staffCommentBodySchema } from '@/lib/validation/quotations'

// Request and response shapes of the sales-side gap endpoints (see docs/mobile-api.md).

export { WriteOffReason }

export const attachUploadBody = z.object({
  uploadId: z.string().min(1).describe('An uploadId from POST /uploads (purpose quotation_attachment)'),
  fileName: z.string().trim().max(200).optional().describe('Shown name; defaults to "photo"'),
  comment: z.string().max(1000).optional(),
})

export const attachmentResponse = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  comment: z.string().nullable(),
  approvalCleared: z.boolean().describe('True when a customer approval was cleared by adding the image'),
})

export const staffCommentBody = z.object({
  body: staffCommentBodySchema,
  attachmentId: z.string().min(1).nullable().optional().describe('Comment on one image'),
})

export const attachmentCommentBody = z.object({ comment: z.string().max(1000) })

export const trackingBody = z
  .object({ replace: z.boolean().optional().describe('Swap the link for a fresh one; the old link stops opening') })
  .default({})

export const messageResponse = z.object({ id: z.string(), message: z.string() })

export const trackingLinkResponse = z.object({
  url: z.string(),
  token: z.string(),
  whatsappText: z.string(),
  whatsappLink: z.string(),
  created: z.boolean(),
})

/** A receipt recorded straight against one invoice. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const amount = z.number().gt(0, 'Amount must be greater than zero').max(99_999_999)

// The services validate again with the web's schemas (src/lib/validation/invoices.ts),
// so these take the raw JSON form (dates as YYYY-MM-DD text).
export const invoicePaymentBody = z.object({
  amount,
  methodId: z.string().trim().min(1, 'Choose a payment mode'),
  paidOn: day,
  reference: z.string().max(120).nullish(),
  notes: z.string().max(500).nullish(),
})

export const writeOffBody = z.object({
  amount,
  reason: z.enum(WriteOffReason),
  writtenOffOn: day,
  notes: z.string().max(500).nullish(),
})

export const allocationsBody = z.object({
  allocations: z.array(allocationSchema).default([]),
  openingApplied: z.coerce.number().min(0).max(99_999_999).default(0),
})

export const deletedResponse = z.object({ id: z.string(), deleted: z.literal(true) })
