import { apiRoute } from '@/lib/api/handler'
import { buildDashboardSummary } from '@/lib/api/reads/dashboard'

/**
 * The home screen's numbers. Needs a company; each block is null when the role
 * lacks the capability behind it (see the schema), so there is no single capability.
 */
export const GET = apiRoute({ auth: 'company' }, async ({ user }) => buildDashboardSummary(user.role))
