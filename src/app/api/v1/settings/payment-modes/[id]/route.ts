import { ApiError } from '@/lib/api/errors'
import { apiRoute, parseWith, reply } from '@/lib/api/handler'
import { MODE_RULES, mustMap } from '@/lib/api/master'
import { findPaymentMode, paymentModeOut, paymentModeRows } from '@/lib/api/reads/master'
import { paymentModePatchBody } from '@/lib/api/schemas/master'
import { parseDetails } from '@/lib/queries/payment-modes'
import {
  deletePaymentMode,
  setPaymentModeActive,
  updatePaymentMode,
} from '@/lib/services/payment-methods'
import { paymentModeSchema } from '@/lib/validation/payment-modes'

/**
 * Only the fields sent change. Past payments keep the name they were recorded
 * with. `isActive` hides or shows the mode (at least one must stay active, 409).
 * Answers the whole updated list.
 */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'settings:update', body: paymentModePatchBody },
  async ({ params, body }) => {
    const row = await findPaymentMode(params.id)

    if (!row) throw new ApiError('NOT_FOUND', 'Payment mode not found.')

    const { isActive, ...rest } = body

    if (Object.keys(rest).length > 0) {
      const current = paymentModeOut(row)
      const data = parseWith(
        paymentModeSchema,
        {
          name: current.name,
          kind: current.kind,
          details: parseDetails(row.details),
          accountDetails: current.accountDetails,
          showOnDocuments: current.showOnDocuments,
          ...rest,
        },
        'payment mode',
      )

      mustMap(await updatePaymentMode(params.id, data as Parameters<typeof updatePaymentMode>[1]), MODE_RULES)
    }

    if (isActive !== undefined && isActive !== row.isActive) {
      mustMap(await setPaymentModeActive(params.id, isActive), MODE_RULES)
    }

    return reply(await paymentModeRows())
  },
)

/** Only a mode that was never used can be deleted (409); hide a used one with isActive false. Answers `{ id, deleted }`. */
export const DELETE = apiRoute({ auth: 'company', capability: 'settings:update' }, async ({ params }) => {
  mustMap(await deletePaymentMode(params.id), MODE_RULES)

  return reply({ id: params.id, deleted: true })
})
