import { apiRoute } from '@/lib/api/handler'
import { checkoutBody } from '@/lib/api/schemas/account'
import { actorOf, must } from '@/lib/api/writes'
import { createCheckoutOrder } from '@/lib/services/billing'

/**
 * Starts a yearly plan purchase and returns the payment page to open in the
 * system browser (same as the web "Choose plan" button). The plan changes when
 * the payment settles; poll GET /billing. Store rules may restrict selling
 * plans inside an app: the product decision to use this is the app's.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', body: checkoutBody, idempotent: true },
  async ({ body, user, companyId }) => {
    const { paymentId, redirectUrl } = must(await createCheckoutOrder({ companyId, actor: actorOf(user), plan: body.plan }))

    return { paymentId, redirectUrl }
  },
)
