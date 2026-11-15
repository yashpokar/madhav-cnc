import { apiRoute, reply } from '@/lib/api/handler'
import { attachUploadBody } from '@/lib/api/schemas/sales'
import { actorOf, must } from '@/lib/api/writes'
import { attachUpload } from '@/lib/services/quotation-attachments'

/**
 * Attaches an image uploaded with POST /uploads (purpose quotation_attachment).
 * Adding one clears a customer approval, as on the web. A confirmed (CONVERTED) quotation is 409.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'quotation:update', body: attachUploadBody, idempotent: true },
  async ({ params, body, user }) => {
    const added = must(await attachUpload(actorOf(user), params.id, body.uploadId, body))

    return reply(
      {
        id: added.id,
        fileName: added.fileName,
        mimeType: added.mimeType,
        sizeBytes: added.sizeBytes,
        comment: added.comment,
        approvalCleared: added.approvalCleared,
      },
      { status: 201 },
    )
  },
)
