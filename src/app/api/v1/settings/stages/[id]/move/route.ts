import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { mustMap } from '@/lib/api/master'
import { stageRows } from '@/lib/api/reads/master'
import { directionBody } from '@/lib/api/schemas/master'
import { moveStage } from '@/lib/services/stages'

/** Moves a stage one place up or down. Answers the whole updated list. */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', body: directionBody, idempotent: true },
  async ({ params, body }) => {
    if (!(await stageRows()).some((row) => row.id === params.id)) throw new ApiError('NOT_FOUND', 'Stage not found.')

    mustMap(await moveStage(params.id, body.direction))

    return reply(await stageRows())
  },
)
