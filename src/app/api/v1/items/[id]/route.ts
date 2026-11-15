import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { itemDetailOut } from '@/lib/api/reads/mappers'
import { can } from '@/lib/permissions'
import { getItem } from '@/lib/queries/items'

export const GET = apiRoute({ auth: 'company', capability: 'item:read' }, async ({ request, params, user }) => {
  const row = await getItem(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Item not found.')

  return replyWithEtag(request, itemDetailOut(row, can(user.role, 'purchase:read')))
})
