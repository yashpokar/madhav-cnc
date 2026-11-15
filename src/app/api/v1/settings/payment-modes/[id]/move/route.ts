import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { MODE_RULES, mustMap } from '@/lib/api/master'
import { findPaymentMode, paymentModeRows } from '@/lib/api/reads/master'
import { directionBody } from '@/lib/api/schemas/master'
import { movePaymentMode } from '@/lib/services/payment-methods'

/** Moves a mode one place up or down in the pickers. Answers the whole updated list. */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', body: directionBody, idempotent: true },
  async ({ params, body }) => {
    if (!(await findPaymentMode(params.id))) throw new ApiError('NOT_FOUND', 'Payment mode not found.')

    mustMap(await movePaymentMode(params.id, body.direction), MODE_RULES)

    return reply(await paymentModeRows())
  },
)
