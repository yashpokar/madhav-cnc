import { apiRoute, reply } from '@/lib/api/handler'
import { mustMap } from '@/lib/api/master'
import { stageRows } from '@/lib/api/reads/master'
import { stageCreateBody } from '@/lib/api/schemas/master'
import { createStage } from '@/lib/services/stages'

const RULES = [[/already exists/i, 'CONFLICT'] as const]

/** Production stages in order, retired ones included, with how many tasks sit in each. */
export const GET = apiRoute({ auth: 'company', capability: 'settings:update' }, async () => reply(await stageRows()))

/** Adds a stage at the end (a name already used is 409). Answers the whole updated list. */
export const POST = apiRoute(
  { auth: 'company', capability: 'settings:update', body: stageCreateBody, idempotent: true },
  async ({ body }) => {
    mustMap(await createStage(body.name), RULES)

    return reply(await stageRows(), { status: 201 })
  },
)
