import { z } from 'zod'
import { PartnerType } from '@/generated/prisma/enums'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value ? value : null))

export const partnerInputSchema = z.object({
  type: z.enum(PartnerType),
  name: z.string().trim().min(1, 'Name is required').max(150),
  firmName: optionalText(150),
  phone: z
    .string()
    .trim()
    .min(6, 'Phone number is required')
    .max(20, 'Phone number is too long'),
  altPhone: optionalText(20),
  email: z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().email('Enter a valid email'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  address: optionalText(300),
  city: optionalText(100),
  state: optionalText(100),
  pincode: z
    .union([
      z.literal(''),
      z.null(),
      z
        .string()
        .trim()
        .regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  isActive: z.boolean().default(true),
  notes: optionalText(1000),
})

export type PartnerInput = z.input<typeof partnerInputSchema>
export type PartnerData = z.output<typeof partnerInputSchema>
