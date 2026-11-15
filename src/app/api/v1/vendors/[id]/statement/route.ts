import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { vendorStatementOut } from '@/lib/api/reads/purchasing'
import { getVendorStatement } from '@/lib/queries/payables'

export const GET = apiRoute({ auth: 'company', capability: 'purchase:read' }, async ({ request, params }) => {
  const statement = await getVendorStatement(params.id)

  if (!statement) throw new ApiError('NOT_FOUND', 'Vendor not found.')

  return replyWithEtag(request, vendorStatementOut(statement))
})
