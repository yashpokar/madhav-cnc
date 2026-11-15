import { apiRoute } from '@/lib/api/handler'
import { decimal } from '@/lib/api/reads/format'
import { stockAdjustBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { adjustStockLogged } from '@/lib/services/stock'

/**
 * Adds (+) or removes (-) stock by hand with a reason (a count, damage, a find).
 * Taking stock below zero is 409 unless an administrator sends `allowNegative: true`.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'stock:create', body: stockAdjustBody, idempotent: true },
  async ({ body, user }) => {
    const result = must(
      await adjustStockLogged(actorOf(user), {
        target: { kind: body.kind, id: body.id },
        qty: body.qty,
        reason: body.reason,
        date: body.date,
        allowNegative: body.allowNegative === true && user.role === 'ADMIN',
      }),
    )

    return saved({ kind: body.kind, id: body.id, onHand: decimal(result.onHand) }, 201)
  },
)
