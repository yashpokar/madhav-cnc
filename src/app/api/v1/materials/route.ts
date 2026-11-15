import { apiRoute, reply } from '@/lib/api/handler'
import { materialRows } from '@/lib/api/reads/master'
import { materialCreateBody } from '@/lib/api/schemas/master'
import { actorOf, must } from '@/lib/api/writes'
import { createMaterial } from '@/lib/services/materials'

/** Every material (item category), inactive ones included, in the order set up. */
export const GET = apiRoute({ auth: 'company', capability: 'item:read' }, async () => reply(await materialRows()))

/** Adds a material at the end of the list (a name already used is 409). Answers the whole updated list. */
export const POST = apiRoute(
  { auth: 'company', capability: 'item:create', body: materialCreateBody, idempotent: true },
  async ({ body, user }) => {
    must(await createMaterial(actorOf(user), body.name))

    return reply(await materialRows(), { status: 201 })
  },
)
