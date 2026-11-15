import { z } from 'zod'

/** An optional amount that must be zero or more. Blank means 0. */
export const openingAmount = z
  .union([
    z.literal(''),
    z.null(),
    z.coerce.number().min(0, 'Cannot be negative').max(999_999_999),
  ])
  .optional()
  .transform((value) => (value === '' || value == null ? 0 : value))

/** An optional "as of" date, turned into a UTC date. */
export const openingDate = z
  .union([
    z.literal(''),
    z.null(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  ])
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null))

/** The date is required once there is an amount. */
export function requireOpeningDate(
  amount: number,
  asOf: Date | null,
  ctx: z.RefinementCtx,
) {
  if (amount > 0 && !asOf) {
    ctx.addIssue({
      code: 'custom',
      path: ['openingAsOf'],
      message: 'Choose the date this balance is as of',
    })
  }
}
