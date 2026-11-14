import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value ? value : null))

export const vendorInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  contactName: optionalText(120),
  phone: optionalText(20),
  email: z
    .union([z.literal(''), z.null(), z.string().trim().email('Enter a valid email')])
    .optional()
    .transform((value) => (value ? value : null)),
  gstin: z
    .union([
      z.literal(''),
      z.null(),
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[0-9A-Z]{15}$/, 'GSTIN is 15 letters and digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  address: optionalText(300),
  city: optionalText(100),
  description: optionalText(500),
  isActive: z.boolean().default(true),
})

export type VendorData = z.output<typeof vendorInputSchema>
