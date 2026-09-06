import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
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
      z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  phone: optionalText(20),
  email: z
    .union([z.literal(''), z.string().trim().email('Enter a valid email')])
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
      z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  bankAccountName: optionalText(150),
  bankName: optionalText(150),
  bankBranch: optionalText(150),
  accountNumber: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^\d{6,20}$/, 'Account number must be 6 to 20 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  ifscCode: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  upiId: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID, like name@bank'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  invoiceTerms: optionalText(2000),
})

export type CompanySettingData = z.output<typeof companySettingSchema>
