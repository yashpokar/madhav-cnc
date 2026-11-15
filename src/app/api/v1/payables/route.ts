import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { payablesOut } from '@/lib/api/reads/purchasing'
import { getPayables } from '@/lib/queries/payables'

/** What the business owes its vendors: totals, ageing and a row per vendor with something due. */
export const GET = apiRoute({ auth: 'company', capability: 'purchase:read' }, async ({ request }) =>
  replyWithEtag(request, payablesOut(await getPayables())),
)
