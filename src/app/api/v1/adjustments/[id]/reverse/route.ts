import { apiRoute } from '@/lib/api/handler'
import { adjustmentFor } from '@/lib/api/reads/master'
import { ADJUSTMENT_RULES, mustMap } from '@/lib/api/master'
import { saved, userActorOf } from '@/lib/api/writes'
import { reverseAdjustment } from '@/lib/services/adjustments'

/**
 * Reverses an adjustment with an opposite entry dated today, linked to the
 * original (both stay on the books). Send X-Audit-Reason. 201 with the new entry.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', idempotent: true },
  async ({ params, user }) => {
    const result = mustMap(await reverseAdjustment(userActorOf(user), params.id), ADJUSTMENT_RULES)

    return saved(await adjustmentFor(result.id), 201)
  },
)
