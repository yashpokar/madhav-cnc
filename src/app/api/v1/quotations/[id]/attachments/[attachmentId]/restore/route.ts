import { apiRoute, reply } from '@/lib/api/handler'
import { requireAttachment } from '@/lib/api/sales-helpers'
import { actorOf, must } from '@/lib/api/writes'
import { restoreAttachment } from '@/lib/services/quotation-attachments'

/** Puts a removed image back in the current set. */
export const POST = apiRoute(
  { auth: 'company', capability: 'quotation:update', idempotent: true },
  async ({ params, user }) => {
    await requireAttachment(params.id, params.attachmentId)

    const result = must(await restoreAttachment(actorOf(user), params.attachmentId))

    return reply({ id: params.attachmentId, message: result.message })
  },
)
