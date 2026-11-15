import { z } from 'zod'
import {
  NoteKind,
  NoteParty,
  NoteReason,
  NoteStatus,
  PaymentMode,
  UnitOfMeasure,
} from '@/generated/prisma/enums'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value ? value : null))

const optionalId = z
  .union([z.literal(''), z.null(), z.string()])
  .optional()
  .transform((value) => (value ? value : null))

const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .transform((value) => new Date(`${value}T00:00:00Z`))

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

export const expenseInputSchema = z.object({
  categoryId: optionalId,
  expenseDate: requiredDate,
  payeeName: z.string().trim().min(1, 'Paid to is required').max(160),
  description: optionalText(500),
  amount: z.coerce
    .number()
    .gt(0, 'Amount must be greater than zero')
    .max(99_999_999),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
  isInputCredit: z.boolean().default(false),
  vendorGstin: optionalText(20),
  billNumber: optionalText(60),
  paymentMode: z.enum(PaymentMode).default('BANK_TRANSFER'),
  reference: optionalText(120),
  notes: optionalText(1000),
  orderId: optionalId,
})

export const noteLineSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(500),
  hsnCode: optionalText(12),
  unit: z.enum(UnitOfMeasure).default('NOS'),
  quantity: z.coerce
    .number()
    .gt(0, 'Quantity must be greater than zero')
    .max(9_999_999),
  rate: z.coerce.number().min(0, 'Rate cannot be negative').max(99_999_999),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
})

export const noteInputSchema = z
  .object({
    kind: z.enum(NoteKind),
    status: z.enum(NoteStatus).default('DRAFT'),
    partyType: z.enum(NoteParty),
    reason: z.enum(NoteReason).default('OTHER'),
    customerId: optionalId,
    vendorName: optionalText(160),
    vendorGstin: optionalText(20),
    invoiceId: optionalId,
    noteDate: requiredDate,
    placeOfSupply: optionalText(100),
    isInterState: z.boolean().default(false),
    reasonNote: optionalText(1000),
    lines: z.array(noteLineSchema).min(1, 'Add at least one line'),
  })
  .refine(
    (data) => data.partyType !== 'CUSTOMER' || Boolean(data.customerId),
    { path: ['customerId'], message: 'Select a customer' },
  )
  .refine(
    (data) => data.partyType !== 'VENDOR' || Boolean(data.vendorName),
    { path: ['vendorName'], message: 'Vendor name is required' },
  )

export type ExpenseCategoryData = z.output<typeof expenseCategorySchema>
export type ExpenseData = z.output<typeof expenseInputSchema>
export type NoteData = z.output<typeof noteInputSchema>
