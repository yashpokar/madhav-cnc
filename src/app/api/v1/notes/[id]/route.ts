import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { assertNoteRefs } from '@/lib/api/master'
import { noteDetailFor } from '@/lib/api/reads/master'
import { noteWriteBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { deleteNote, updateNote } from '@/lib/services/notes'

export const GET = apiRoute({ auth: 'company', capability: 'note:read' }, async ({ request, params }) =>
  replyWithEtag(request, await noteDetailFor(params.id)),
)

/** Replaces a draft note (send the whole document; its kind and status do not change here). An issued note is 409. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'note:update', body: noteWriteBody },
  async ({ params, body, user }) => {
    await assertNoteRefs(body)

    must(await updateNote(actorOf(user), params.id, body))

    return saved(await noteDetailFor(params.id))
  },
)

/** A note that is issued must be cancelled first (409). */
export const DELETE = apiRoute({ auth: 'company', capability: 'note:delete' }, async ({ params }) => {
  must(await deleteNote(params.id))

  return reply({ id: params.id, deleted: true })
})
