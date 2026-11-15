import { apiRoute } from '@/lib/api/handler'
import { goodsReceiptDetailFor } from '@/lib/api/reads/purchasing'
import { goodsReceiptCancelBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { cancelReceiptLogged } from '@/lib/services/goods-receipts'

/**
 * Cancels a receipt and reverses its stock. Stock that would go below zero is
 * 409 unless an administrator sends `allowNegative: true`.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'stock:update', body: goodsReceiptCancelBody, idempotent: true },
  async ({ params, body, user }) => {
    const result = must(
      await cancelReceiptLogged(actorOf(user), params.id, {
        allowNegative: body.allowNegative === true && user.role === 'ADMIN',
      }),
    )

    return saved(await goodsReceiptDetailFor(params.id), 200, {
      message: result.alreadyCancelled ? `${result.number} is already cancelled` : `${result.number} cancelled and its stock reversed`,
    })
  },
)
