import { apiRoute } from '@/lib/api/handler'
import { capabilitiesFor } from '@/lib/permissions'

export const GET = apiRoute({ auth: 'company' }, async ({ user, companyId }) => ({
  companyId,
  role: user.role,
  capabilities: capabilitiesFor(user.role),
}))
