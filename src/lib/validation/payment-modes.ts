import { z } from 'zod'
import { PaymentMode } from '@/generated/prisma/enums'

const detailSchema = z.object({
  label: z.string().trim().max(60, 'Keep each label under 60 characters'),
  value: z.string().trim().max(300, 'Keep each value under 300 characters'),
})

/** A payment mode as JSON: this is what the settings screen and the API both send. */
export const paymentModeSchema = z.object({
  name: z.string().trim().min(1, 'Give the mode a name').max(60, 'Keep the name under 60 characters'),
  kind: z.enum(PaymentMode),
  /** Anything worth showing with the mode: bank, account number, IFSC, UPI ID... */
  details: z
    .array(detailSchema)
    .max(20, 'Add up to 20 details')
    .default([])
    .transform((rows) => rows.filter((row) => row.label || row.value)),
  /** How we receive money in this kind of mode (UPI ID, account number, IFSC...), checked per kind by the service. */
  accountDetails: z.record(z.string(), z.unknown()).default({}),
  showOnDocuments: z.boolean().default(false),
})

export type PaymentModeData = z.output<typeof paymentModeSchema>

/** What callers pass (before defaults and trimming). */
export type PaymentModeInput = {
  name: string
  kind: string
  details?: { label: string; value: string }[]
  accountDetails?: Record<string, string>
  showOnDocuments?: boolean
}
