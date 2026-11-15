import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { adjustmentFor } from '@/lib/api/reads/master'
import { ADJUSTMENT_RULES, mustMap } from '@/lib/api/master'
import { adjustmentWriteBody } from '@/lib/api/schemas/master'
import { saved, userActorOf } from '@/lib/api/writes'
import { deleteAdjustment, updateAdjustment } from '@/lib/services/adjustments'

export const GET = apiRoute({ auth: 'company', capability: 'payment:read' }, async ({ request, params }) =>
  replyWithEtag(request, await adjustmentFor(params.id)),
)

/** Corrects the amount, date, reason or note (send the whole body); what was adjusted stays fixed. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'settings:update', body: adjustmentWriteBody },
  async ({ params, body, user }) => {
    mustMap(await updateAdjustment(userActorOf(user), params.id, body), ADJUSTMENT_RULES)

    return saved(await adjustmentFor(params.id))
  },
)

/** Removing an adjustment puts the balance back exactly as it was before it. */
export const DELETE = apiRoute({ auth: 'company', capability: 'settings:update' }, async ({ params, user }) => {
  mustMap(await deleteAdjustment(userActorOf(user), params.id), ADJUSTMENT_RULES)

  return reply({ id: params.id, deleted: true })
})
