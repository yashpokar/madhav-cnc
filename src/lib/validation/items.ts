import { z } from 'zod'
import { ItemType, UnitOfMeasure } from '@/generated/prisma/enums'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null))

const optionalDecimal = (max: number, label: string) =>
  z
    .union([z.literal(''), z.coerce.number().min(0, `${label} cannot be negative`).max(max)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value))

export const itemInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: optionalText(1000),
  type: z.enum(ItemType).default('MATERIAL'),
  categoryId: z
    .union([z.literal(''), z.string().trim().min(1)])
    .optional()
    .transform((value) => (value ? value : null)),
  unit: z.enum(UnitOfMeasure).default('NOS'),
  rate: z.coerce
    .number()
    .min(0, 'Rate cannot be negative')
    .max(99_999_999, 'Rate is too large'),
  purchaseRate: optionalDecimal(99_999_999, 'Purchase rate'),
  brand: optionalText(100),
  shade: optionalText(100),
  thicknessMm: optionalDecimal(999_999, 'Thickness'),
  lengthMm: optionalDecimal(999_999, 'Length'),
  widthMm: optionalDecimal(999_999, 'Width'),
  hsnCode: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^\d{4,8}$/, 'HSN or SAC must be 4 to 8 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  taxRatePercent: z.coerce
    .number()
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100'),
  isActive: z.boolean().default(true),
  notes: optionalText(1000),
})

export const itemCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
})

export type ItemData = z.output<typeof itemInputSchema>
