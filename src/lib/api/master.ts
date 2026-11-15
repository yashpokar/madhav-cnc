import { z } from 'zod'
import { ApiError, type ApiErrorCode } from '@/lib/api/errors'
import { refusalCode } from '@/lib/api/writes'
import { prisma } from '@/lib/prisma'

// Helpers for the master-data and settings endpoints. Several of those services
// refuse with only a message (no code), so the handler says which messages mean
// 404 or 422; everything else follows the shared rules in writes.ts (must).

/** `[pattern, code, field?]`: a refusal whose message matches is that error (422 puts the message on `field`). */
export type RefusalRule = readonly [RegExp, ApiErrorCode, string?]

type Refusal = { ok: false; error: string; code?: ApiErrorCode; fieldErrors?: Record<string, string> }

/** Like `must`, with per-service message rules tried first. */
export function mustMap<T extends { ok: boolean }>(result: T, rules: readonly RefusalRule[] = []): Extract<T, { ok: true }> {
  if (result.ok) return result as Extract<T, { ok: true }>

  const refusal = result as unknown as Refusal

  for (const [pattern, code, field] of rules) {
    if (pattern.test(refusal.error)) {
      throw new ApiError(
        code,
        refusal.error,
        code === 'VALIDATION_FAILED' ? { fields: refusal.fieldErrors ?? { [field ?? '_']: refusal.error } } : {},
      )
    }
  }

  const code = refusalCode(refusal)

  throw new ApiError(
    code,
    refusal.error,
    code === 'VALIDATION_FAILED' ? { fields: refusal.fieldErrors ?? { _: refusal.error } } : {},
  )
}

export const NOT_FOUND_RULE: RefusalRule = [/no longer exists|\bnot found\b|\bwas not found\b/i, 'NOT_FOUND']

/** What the payment-mode service's message-only refusals mean. */
export const MODE_RULES: readonly RefusalRule[] = [
  [/no longer exists|\bnot found\b/i, 'NOT_FOUND'],
  [/already a mode with that name|at least one payment mode|has been used/i, 'CONFLICT'],
  [/Choose NEFT/i, 'VALIDATION_FAILED', 'kind'],
  [/./, 'VALIDATION_FAILED', 'accountDetails'],
]

/** Balance adjustments: a date too far ahead is a field error (the service answers with a message only). */
export const ADJUSTMENT_RULES: readonly RefusalRule[] = [[/far in the future/i, 'VALIDATION_FAILED', 'adjustedOn']]

/** A note's customer and invoice must be this company's (the company scope hides anything else): 422 with the field. */
export async function assertNoteRefs(data: { customerId?: string | null; invoiceId?: string | null }) {
  const fields: Record<string, string> = {}

  if (data.customerId && !(await prisma.customer.findUnique({ where: { id: data.customerId }, select: { id: true } }))) {
    fields.customerId = 'Customer not found'
  }

  if (data.invoiceId && !(await prisma.invoice.findUnique({ where: { id: data.invoiceId }, select: { id: true } }))) {
    fields.invoiceId = 'Invoice not found'
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError('VALIDATION_FAILED', 'Check the highlighted fields.', { fields })
  }
}

/**
 * For services that take the raw (input) shape and run the schema themselves:
 * the body is checked against `schema` (a failure is a 422 with the field paths)
 * but handed on exactly as sent.
 */
export function checked<S extends z.ZodType>(schema: S) {
  return z
    .unknown()
    .superRefine((value, ctx) => {
      const parsed = schema.safeParse(value)

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
        }
      }
    })
    .transform((value) => value as z.input<S>)
}
