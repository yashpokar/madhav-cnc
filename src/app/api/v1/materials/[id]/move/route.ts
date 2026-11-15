import { apiRoute, reply } from '@/lib/api/handler'
import { materialRows } from '@/lib/api/reads/master'
import { directionBody } from '@/lib/api/schemas/master'
import { must } from '@/lib/api/writes'
import { moveMaterial } from '@/lib/services/materials'

/** Moves a material one place up or down (already at the end is 409). Answers the whole updated list. */
export const POST = apiRoute(
  { auth: 'company', capability: 'item:update', body: directionBody, idempotent: true },
  async ({ params, body }) => {
    must(await moveMaterial(params.id, body.direction))

    return reply(await materialRows())
  },
)
