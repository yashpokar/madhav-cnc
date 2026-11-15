import type { z } from 'zod'
import type { ApiUser } from '@/lib/api/auth'
import { apiRoute } from '@/lib/api/handler'
import { productionTaskFor } from '@/lib/api/reads/detail'
import { must, productionActorOf, saved } from '@/lib/api/writes'
import type { ServiceResult } from '@/lib/services/production'

/**
 * A production task action (start, complete, hold, ...): needs production:update
 * like the web, runs the production service as the signed-in person (their role
 * decides whether `force` is allowed) and answers the task as the board lists
 * it, with the service's message in meta. The order's own status (a finished
 * last stage completes it) is in `order.status`.
 */
export function taskAction<B extends z.ZodType>(
  body: B,
  run: (args: { actor: ReturnType<typeof productionActorOf>; taskId: string; body: z.output<B>; user: ApiUser }) => Promise<ServiceResult>,
) {
  return apiRoute(
    { auth: 'company', capability: 'production:update', body, idempotent: true },
    async ({ params, body: parsed, user }) => {
      const result = must(await run({ actor: productionActorOf(user), taskId: params.id, body: parsed as z.output<B>, user }))

      return saved(await productionTaskFor(params.id), 200, { message: result.message })
    },
  )
}
