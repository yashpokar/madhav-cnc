import { z } from 'zod'
import {
  DiscountType,
  InvoiceStatus,
  PaymentMode,
  UnitOfMeasure,
} from '@/generated/prisma/enums'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value ? value : null))

const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .transform((value) => new Date(`${value}T00:00:00Z`))

const optionalDate = z
  .union([
    z.literal(''),
    z.null(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  ])
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null))

export const invoiceLineSchema = z.object({
  itemId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  description: z.string().trim().min(1, 'Description is required').max(500),
  hsnCode: optionalText(12),
  unit: z.enum(UnitOfMeasure),
  quantity: z.coerce
    .number()
    .gt(0, 'Quantity must be greater than zero')
    .max(9_999_999),
  rate: z.coerce.number().min(0, 'Rate cannot be negative').max(99_999_999),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
})

export const invoiceInputSchema = z.object({
  customerId: z.string().trim().min(1, 'Select a customer'),
  orderId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  invoiceDate: requiredDate,
  dueDate: optionalDate,
  status: z.enum(InvoiceStatus).default('DRAFT'),
  placeOfSupply: optionalText(100),
  isInterState: z.boolean().default(false),
  billingAddress: optionalText(300),
  customerGstin: optionalText(20),
  discountType: z.enum(DiscountType).default('NONE'),
  discountValue: z.coerce.number().min(0).max(99_999_999).default(0),
  transportCharge: z.coerce.number().min(0).max(9_999_999).default(0),
  transportTaxRatePercent: z.coerce.number().min(0).max(100).default(18),
  advanceAdjusted: z.coerce.number().min(0).max(99_999_999).default(0),
  notes: optionalText(2000),
  terms: optionalText(2000),
  lines: z.array(invoiceLineSchema).min(1, 'Add at least one line'),
})

export const paymentInputSchema = z.object({
  amount: z.coerce
    .number()
    .gt(0, 'Amount must be greater than zero')
    .max(99_999_999),
  mode: z.enum(PaymentMode).default('UPI'),
  reference: optionalText(120),
  paidOn: requiredDate,
  notes: optionalText(500),
})

export type InvoiceData = z.output<typeof invoiceInputSchema>
export type PaymentData = z.output<typeof paymentInputSchema>
