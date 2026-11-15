import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { goodsReceiptDetailFor } from '@/lib/api/reads/purchasing'

export const GET = apiRoute({ auth: 'company', capability: 'purchase:read' }, async ({ request, params }) =>
  replyWithEtag(request, await goodsReceiptDetailFor(params.id)),
)
