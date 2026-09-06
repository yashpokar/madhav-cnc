import { z } from 'zod'
import {
  DiscountType,
  MaterialSupply,
  OrderStatus,
} from '@/generated/prisma/enums'
import { quotationLineSchema } from '@/lib/validation/quotations'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
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

export const orderLineSchema = quotationLineSchema

export const orderInputSchema = z.object({
  customerId: z.string().trim().min(1, 'Select a customer'),
  architectId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  carpenterId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  materialSupply: z.enum(MaterialSupply).default('WITH_MATERIAL'),
  subject: optionalText(200),
  customerPoNumber: optionalText(60),
  orderDate: requiredDate,
  dueDate: optionalDate,
  siteAddress: optionalText(300),
  siteCity: optionalText(100),
  sitePincode: z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  status: z.enum(OrderStatus).default('DRAFT'),
  discountType: z.enum(DiscountType).default('NONE'),
  discountValue: z.coerce.number().min(0).max(99_999_999).default(0),
  advanceAmount: z.coerce.number().min(0).max(99_999_999).default(0),
  transportCharge: z.coerce.number().min(0).max(9_999_999).default(0),
  transportTaxRatePercent: z.coerce.number().min(0).max(100).default(18),
  notes: optionalText(2000),
  terms: optionalText(2000),
  lines: z.array(orderLineSchema).min(1, 'Add at least one line'),
})

export type OrderData = z.output<typeof orderInputSchema>
