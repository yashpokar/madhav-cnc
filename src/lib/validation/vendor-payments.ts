import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value ? value : null))

const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .transform((value) => new Date(`${value}T00:00:00Z`))

export const billAllocationSchema = z.object({
  billId: z.string().trim().min(1),
  amount: z.coerce.number().min(0).max(99_999_999),
})

export const vendorPaymentInputSchema = z.object({
  vendorId: z.string().trim().min(1, 'Select a vendor'),
  amount: z.coerce
    .number()
    .gt(0, 'Amount must be greater than zero')
    .max(99_999_999),
  channelId: z.string().trim().min(1, 'Choose a payment mode'),
  /** The method's fields as posted (JSON); the service validates them against the chosen method. */
  paymentDetails: z.string().max(4000).default(''),
  paidOn: requiredDate,
  notes: optionalText(500),
  allocations: z.array(billAllocationSchema).default([]),
  /** Part of the payment that settles the vendor's opening payable. */
  openingApplied: z.coerce.number().min(0).max(99_999_999).default(0),
})

export type VendorPaymentData = z.output<typeof vendorPaymentInputSchema>
export type BillAllocationInput = { billId: string; amount: number }
