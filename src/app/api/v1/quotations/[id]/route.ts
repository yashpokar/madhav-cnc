import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { quotationDetailFor } from '@/lib/api/reads/detail'
import { quotationDetailOut } from '@/lib/api/reads/mappers'
import { quotationWriteBody } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { getQuotation } from '@/lib/queries/quotations'
import { updateQuotation } from '@/lib/services/quotations'

export const GET = apiRoute({ auth: 'company', capability: 'quotation:read' }, async ({ request, params }) => {
  const row = await getQuotation(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Quotation not found.')

  return replyWithEtag(request, quotationDetailOut(row))
})

/**
 * Replaces a draft quotation's header and lines (send the whole document).
 * Anything but a draft is 409: change its status instead, or make a revision on the web.
 */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'quotation:update', body: quotationWriteBody },
  async ({ params, body, user }) => {
    const current = await getQuotation(params.id)

    if (!current) throw new ApiError('NOT_FOUND', 'Quotation not found.')

    if (current.status !== 'DRAFT') {
      throw new ApiError('CONFLICT', 'Only a draft quotation can be edited.')
    }

    must(await updateQuotation(userActorOf(user), params.id, { ...body, status: 'DRAFT' }))

    return saved(await quotationDetailFor(params.id))
  },
)
