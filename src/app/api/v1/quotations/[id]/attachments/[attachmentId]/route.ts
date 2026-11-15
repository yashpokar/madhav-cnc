import { z } from 'zod'
import { apiRoute, reply } from '@/lib/api/handler'
import { requireAttachment } from '@/lib/api/sales-helpers'
import { actorOf, must } from '@/lib/api/writes'
import { removeAttachment, setAttachmentComment } from '@/lib/services/quotation-attachments'

const commentBody = z.object({ comment: z.string().max(1000) })

/** Replaces the image's comment. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'quotation:update', body: commentBody },
  async ({ params, body }) => {
    await requireAttachment(params.id, params.attachmentId)

    const result = must(await setAttachmentComment(params.attachmentId, body.comment))

    return reply({ id: params.attachmentId, message: result.message })
  },
)

/** Takes the image out of the current set (restorable). Clears a customer approval. */
export const DELETE = apiRoute({ auth: 'company', capability: 'quotation:update' }, async ({ params, user }) => {
  await requireAttachment(params.id, params.attachmentId)

  must(await removeAttachment(actorOf(user), params.attachmentId))

  return reply({ id: params.attachmentId, deleted: true })
})
