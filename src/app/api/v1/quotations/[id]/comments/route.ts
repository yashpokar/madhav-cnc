import { apiRoute, reply } from '@/lib/api/handler'
import { staffCommentBody } from '@/lib/api/schemas/sales'
import { must, userActorOf } from '@/lib/api/writes'
import { addStaffComment } from '@/lib/services/quotations'

/** A staff comment on the quotation (optionally on one of its images). */
export const POST = apiRoute(
  { auth: 'company', capability: 'quotation:update', body: staffCommentBody, idempotent: true },
  async ({ params, body, user }) => {
    const result = must(await addStaffComment(userActorOf(user), params.id, body.body, body.attachmentId))

    return reply({ id: params.id, message: result.message }, { status: 201 })
  },
)
