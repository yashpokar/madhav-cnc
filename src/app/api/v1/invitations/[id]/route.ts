import { apiRoute, reply } from '@/lib/api/handler'
import { actorOf, must } from '@/lib/api/writes'
import { revokeInviteFor } from '@/lib/services/team'

/** Revokes an open invitation; its link stops working. One that is no longer open is 409. */
export const DELETE = apiRoute({ auth: 'company', capability: 'user:update' }, async ({ params, user, companyId }) => {
  must(await revokeInviteFor(actorOf(user), companyId, params.id))

  return reply({ id: params.id, deleted: true })
})
