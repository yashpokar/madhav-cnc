import { z } from 'zod'
import {
  DimensionUnit,
  DiscountType,
  MaterialSupply,
  QuotationStatus,
  UnitOfMeasure,
} from '@/generated/prisma/enums'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))

const optionalNumber = z
  .union([z.literal(''), z.null(), z.coerce.number()])
  .optional()
  .transform((value) =>
    value === '' || value === null || value === undefined ? null : value,
  )

const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .transform((value) => new Date(`${value}T00:00:00Z`))

const optionalDate = z
  .union([z.literal(''), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')])
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null))

export const quotationLineSchema = z.object({
  itemId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  description: z.string().trim().min(1, 'Description is required').max(500),
  unit: z.enum(UnitOfMeasure),
  materialSupply: z.enum(MaterialSupply).default('WITH_MATERIAL'),
  isFlatRate: z.coerce.boolean().default(false),
  dimensionUnit: z
    .union([z.literal(''), z.null(), z.enum(DimensionUnit)])
    .optional()
    .transform((value) => (value ? value : null)),
  length: optionalNumber,
  width: optionalNumber,
  pieces: optionalNumber,
  quantity: z.coerce
    .number()
    .gt(0, 'Quantity must be greater than zero')
    .max(9_999_999),
  rate: z.coerce.number().min(0, 'Rate cannot be negative').max(99_999_999),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
  hsnCode: optionalText(12),
  notes: optionalText(500),
})

export const quotationInputSchema = z.object({
  customerId: z.string().trim().min(1, 'Select a customer'),
  architectId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  carpenterId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  subject: optionalText(200),
  quotationDate: requiredDate,
  validUntil: optionalDate,
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
  status: z.enum(QuotationStatus).default('DRAFT'),
  discountType: z.enum(DiscountType).default('NONE'),
  discountValue: z.coerce.number().min(0).max(99_999_999).default(0),
  advancePercent: z.coerce
    .number()
    .min(0, 'Advance cannot be negative')
    .max(100, 'Advance cannot exceed 100%')
    .default(80),
  notes: optionalText(2000),
  terms: optionalText(2000),
  lines: z
    .array(quotationLineSchema)
    .min(1, 'Add at least one line'),
})

export type QuotationLineData = z.output<typeof quotationLineSchema>
export type QuotationData = z.output<typeof quotationInputSchema>
