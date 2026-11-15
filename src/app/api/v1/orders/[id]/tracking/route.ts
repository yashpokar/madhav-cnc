import { z } from 'zod'
import { apiRoute, reply } from '@/lib/api/handler'
import { baseUrl } from '@/lib/api/public-url'
import { requireFound } from '@/lib/api/sales-helpers'
import { must, userActorOf } from '@/lib/api/writes'
import { getOrder } from '@/lib/queries/orders'
import { createTrackingLink, replaceTrackingLink, revokeTrackingLink } from '@/lib/services/orders'

const trackingBody = z.object({ replace: z.boolean().optional().describe('Swap the link for a fresh one; the old link stops opening') }).default({})

/** The customer tracking link: the active one, a new one, or (replace: true) a fresh one. */
export const POST = apiRoute(
  { auth: 'company', capability: 'order:update', body: trackingBody, idempotent: true },
  async ({ params, body, user }) => {
    const actor = userActorOf(user)
    const result = must(
      body.replace
        ? await replaceTrackingLink(actor, params.id, baseUrl())
        : await createTrackingLink(actor, params.id, baseUrl()),
    )

    return reply({
      url: result.url,
      token: result.token,
      whatsappText: result.whatsappText,
      whatsappLink: result.whatsappLink,
      created: 'created' in result ? result.created : true,
    })
  },
)

/** Stops the tracking link opening. No active link is 409. */
export const DELETE = apiRoute({ auth: 'company', capability: 'order:update' }, async ({ params, user }) => {
  requireFound(await getOrder(params.id), 'Order')
  must(await revokeTrackingLink(userActorOf(user), params.id))

  return reply({ id: params.id, deleted: true })
})
