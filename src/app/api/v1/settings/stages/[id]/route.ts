import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { mustMap } from '@/lib/api/master'
import { stageRows } from '@/lib/api/reads/master'
import { stagePatchBody } from '@/lib/api/schemas/master'
import { deleteStage, renameStage, setStageActive, setStageStatus } from '@/lib/services/stages'

const RULES = [[/already exists/i, 'CONFLICT'] as const]

/**
 * Partial: send any of name, isActive (retiring is 409 while open tasks sit in
 * the stage) and linkedStatus (the order status reached on completion, or null).
 * Answers the whole updated list.
 */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'settings:update', body: stagePatchBody },
  async ({ params, body }) => {
    const current = (await stageRows()).find((row) => row.id === params.id)

    if (!current) throw new ApiError('NOT_FOUND', 'Stage not found.')

    if (body.name !== undefined && body.name !== current.name) {
      mustMap(await renameStage(params.id, body.name), RULES)
    }

    if (body.linkedStatus !== undefined && body.linkedStatus !== current.linkedStatus) {
      mustMap(await setStageStatus(params.id, body.linkedStatus), RULES)
    }

    if (body.isActive !== undefined && body.isActive !== current.isActive) {
      mustMap(await setStageActive(params.id, body.isActive), RULES)
    }

    return reply(await stageRows())
  },
)

/** Refused with 409 while tasks are on record: retire it instead. */
export const DELETE = apiRoute({ auth: 'company', capability: 'settings:update' }, async ({ params }) => {
  mustMap(await deleteStage(params.id), RULES)

  return reply({ id: params.id, deleted: true })
})
