import { z } from 'zod'
import { CustomerStatus, CustomerType } from '@/generated/prisma/enums'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null))

const optionalDate = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')])
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null))

const optionalId = z
  .union([z.literal(''), z.string().trim().min(1)])
  .optional()
  .transform((value) => (value ? value : null))

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  type: z.enum(CustomerType).default('INDIVIDUAL'),
  status: z.enum(CustomerStatus).default('ACTIVE'),
  phone: z
    .string()
    .trim()
    .min(6, 'Phone number is required')
    .max(20, 'Phone number is too long'),
  altPhone: optionalText(20),
  email: z
    .union([z.literal(''), z.string().trim().email('Enter a valid email')])
    .optional()
    .transform((value) => (value ? value : null)),
  address: optionalText(300),
  city: optionalText(100),
  state: optionalText(100),
  pincode: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  gstin: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(
          /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/,
          'Enter a valid 15-character GSTIN',
        ),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  pan: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  dateOfBirth: optionalDate,
  anniversaryDate: optionalDate,
  preferredArchitectId: optionalId,
  preferredCarpenterId: optionalId,
  paymentTermsDays: z
    .union([z.literal(''), z.coerce.number().int().min(0).max(365)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  notes: optionalText(1000),
})

export type CustomerInput = z.input<typeof customerInputSchema>
export type CustomerData = z.output<typeof customerInputSchema>
