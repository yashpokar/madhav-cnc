import { z } from 'zod'
import { UnitOfMeasure } from '@/generated/prisma/enums'

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

const optionalDate = z
  .union([
    z.literal(''),
    z.null(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  ])
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null))

const quantity = z.coerce
  .number()
  .gt(0, 'Quantity must be greater than zero')
  .max(9_999_999)

const rate = z.coerce
  .number()
  .min(0, 'Rate cannot be negative')
  .max(99_999_999)

const gstRate = z.coerce.number().min(0).max(100).default(0)

/** A line may point at an item or a material, or be free text; never both. */
const lineTarget = {
  itemId: optionalId,
  materialId: optionalId,
}

function exclusive(line: { itemId: string | null; materialId: string | null }) {
  return !(line.itemId && line.materialId)
}

const BOTH = {
  message: 'A line can refer to an item or a material, not both',
  path: ['itemId'],
}

export const billLineSchema = z
  .object({
    ...lineTarget,
    poLineId: optionalId,
    description: z.string().trim().min(1, 'Description is required').max(500),
    hsnCode: optionalText(12),
    qty: quantity,
    unit: z.enum(UnitOfMeasure),
    rate,
    discount: z.coerce
      .number()
      .min(0, 'Discount cannot be negative')
      .max(99_999_999)
      .default(0),
    taxRatePercent: gstRate,
  })
  .refine(exclusive, BOTH)

export const billInputSchema = z.object({
  vendorId: z.string().trim().min(1, 'Select a vendor'),
  poId: optionalId,
  vendorBillNumber: optionalText(60),
  billDate: requiredDate,
  dueDate: optionalDate,
  isInterState: z.boolean().default(false),
  notes: optionalText(2000),
  lines: z.array(billLineSchema).min(1, 'Add at least one line').max(200),
})

export const orderLineSchema = z
  .object({
    ...lineTarget,
    description: z.string().trim().min(1, 'Description is required').max(500),
    qty: quantity,
    unit: z.enum(UnitOfMeasure),
    rate,
    taxRatePercent: gstRate,
  })
  .refine(exclusive, BOTH)

export const orderInputSchema = z.object({
  vendorId: z.string().trim().min(1, 'Select a vendor'),
  orderDate: requiredDate,
  expectedDate: optionalDate,
  notes: optionalText(2000),
  lines: z.array(orderLineSchema).min(1, 'Add at least one line').max(200),
})

export type BillData = z.output<typeof billInputSchema>
export type OrderData = z.output<typeof orderInputSchema>
