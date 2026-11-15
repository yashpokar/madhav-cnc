import { apiRoute } from '@/lib/api/handler'
import { productionTaskFor } from '@/lib/api/reads/detail'
import { taskNotesBody } from '@/lib/api/schemas/writes'
import { must, productionActorOf, saved } from '@/lib/api/writes'
import { saveTaskNotes } from '@/lib/services/production'

/** Replaces the stage's notes (an empty string clears them). */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'production:update', body: taskNotesBody },
  async ({ params, body, user }) => {
    must(await saveTaskNotes(productionActorOf(user), params.id, body.notes))

    return saved(await productionTaskFor(params.id))
  },
)
