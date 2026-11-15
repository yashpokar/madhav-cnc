import { apiRoute } from '@/lib/api/handler'
import { noteDetailFor } from '@/lib/api/reads/master'
import { noteStatusBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { setNoteStatus } from '@/lib/services/notes'

/** Issue, cancel or move back to draft; the same status again is 409. */
export const POST = apiRoute(
  { auth: 'company', capability: 'note:update', body: noteStatusBody, idempotent: true },
  async ({ params, body, user }) => {
    must(await setNoteStatus(actorOf(user), params.id, body.status))

    return saved(await noteDetailFor(params.id))
  },
)
