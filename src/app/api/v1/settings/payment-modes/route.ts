import { apiRoute, reply } from '@/lib/api/handler'
import { MODE_RULES, mustMap } from '@/lib/api/master'
import { paymentModeRows } from '@/lib/api/reads/master'
import { paymentModeWriteBody } from '@/lib/api/schemas/master'
import { addPaymentMode } from '@/lib/services/payment-methods'

/** Every payment mode, hidden ones too, with its receiving details and how often it has been used. */
export const GET = apiRoute({ auth: 'company', capability: 'settings:update' }, async () =>
  reply(await paymentModeRows()),
)

/** Adds a mode at the end of the list (a name already used is 409). Answers the whole updated list. */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', body: paymentModeWriteBody, idempotent: true },
  async ({ body }) => {
    mustMap(await addPaymentMode(body as Parameters<typeof addPaymentMode>[0]), MODE_RULES)

    return reply(await paymentModeRows(), { status: 201 })
  },
)
