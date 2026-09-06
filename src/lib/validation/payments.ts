import { z } from 'zod'
import { PaymentMode } from '@/generated/prisma/enums'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value ? value : null))

const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .transform((value) => new Date(`${value}T00:00:00Z`))

export const allocationSchema = z.object({
  invoiceId: z.string().trim().min(1),
  amount: z.coerce.number().min(0).max(99_999_999),
})

export const receiptInputSchema = z.object({
  customerId: z.string().trim().min(1, 'Select a customer'),
  amount: z.coerce
    .number()
    .gt(0, 'Amount must be greater than zero')
    .max(99_999_999),
  mode: z.enum(PaymentMode).default('UPI'),
  reference: optionalText(120),
  paidOn: requiredDate,
  notes: optionalText(500),
  allocations: z.array(allocationSchema).default([]),
})

export type ReceiptData = z.output<typeof receiptInputSchema>
