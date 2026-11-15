import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { checked } from '@/lib/api/master'
import { dispatchDetailFor } from '@/lib/api/reads/master'
import { dispatchWriteBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { deleteDispatch, updateDispatch } from '@/lib/services/dispatches'

export const GET = apiRoute({ auth: 'company', capability: 'dispatch:read' }, async ({ request, params }) =>
  replyWithEtag(request, await dispatchDetailFor(params.id)),
)

/** Replaces the challan (send the whole document); one already delivered is 409. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'dispatch:update', body: checked(dispatchWriteBody) },
  async ({ params, body, user }) => {
    must(await updateDispatch(actorOf(user), params.id, body))

    return saved(await dispatchDetailFor(params.id))
  },
)

/** Only a draft or cancelled challan can be deleted (409 once goods have left). */
export const DELETE = apiRoute({ auth: 'company', capability: 'dispatch:delete' }, async ({ params, user }) => {
  must(await deleteDispatch(actorOf(user), params.id))

  return reply({ id: params.id, deleted: true })
})
