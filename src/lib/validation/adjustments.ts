import { z } from 'zod'
import { BalanceAdjustmentReason } from '@/generated/prisma/enums'
import { MAX_ADJUSTMENT } from '@/lib/adjustments-math'

/**
 * What the adjust-balance dialog sends: a positive amount and a direction (the
 * sign is derived on the server), a date, a reason and a required note.
 */
export const adjustmentInputSchema = z.object({
  kind: z.enum(['CHANNEL', 'CUSTOMER']),
  /** The payment mode (CHANNEL) or the customer (CUSTOMER). */
  targetId: z.string().trim().min(1, 'Choose what to adjust'),
  direction: z.enum(['up', 'down']),
  amount: z.coerce
    .number({ error: 'Enter an amount' })
    .refine((value) => Math.abs(value) > 0, 'Enter an amount greater than zero')
    .refine((value) => Math.abs(value) <= MAX_ADJUSTMENT, 'That amount is too large'),
  adjustedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date of the adjustment'),
  reason: z.enum(BalanceAdjustmentReason),
  note: z.string().trim().min(3, 'Write what happened (at least 3 characters)').max(500),
})

export type AdjustmentInput = z.input<typeof adjustmentInputSchema>
