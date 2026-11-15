import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value ? value : null))

export const companySettingSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(150),
  addressLine: optionalText(300),
  city: optionalText(100),
  state: optionalText(100),
  pincode: z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  phone: optionalText(20),
  email: z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().email('Enter a valid email'),
    ])
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
      z.null(),
      z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  defaultAdvancePercent: z.coerce
    .number()
    .min(0, 'Advance cannot be negative')
    .max(100, 'Advance cannot exceed 100%'),
  invoiceTerms: optionalText(2000),
  signatoryName: optionalText(120),
  signatoryTitle: optionalText(80),
})

export type CompanySettingData = z.output<typeof companySettingSchema>
