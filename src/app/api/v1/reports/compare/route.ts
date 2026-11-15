import { apiRoute } from '@/lib/api/handler'
import { buildCompareResponse, compareAccess } from '@/lib/api/reads/compare'
import { ApiError } from '@/lib/api/errors'
import { compareQuery } from '@/lib/api/schemas/compare'

/**
 * Week over week, month over month or year over year: this period so far against
 * the same days of the previous period and of a year ago, plus a 12-period trend.
 * Needs invoice:read (the web Reports page's gate); each metric inside is left
 * out when the role lacks its own capability.
 */
export const GET = apiRoute(
  { auth: 'company', capability: 'invoice:read', query: compareQuery },
  async ({ user, query }) => {
    if (!Object.values(compareAccess(user.role)).some(Boolean)) {
      throw new ApiError('FORBIDDEN', 'Your role cannot read any of these figures')
    }

    return buildCompareResponse(user.role, query.period)
  },
)
