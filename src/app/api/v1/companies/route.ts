import { apiRoute, reply } from '@/lib/api/handler'
import { ApiError } from '@/lib/api/errors'
import { createCompanyBody } from '@/lib/api/schemas'
import { capabilitiesFor } from '@/lib/permissions'
import { createOwnCompanyFor } from '@/lib/services/companies'

/**
 * Onboarding: the signed-in person creates their own company and becomes its
 * administrator. Same rules as the web (one company to start, 3-company cap,
 * industry required). Send an Idempotency-Key so a retry after a dropped
 * connection can not create two.
 */
export const POST = apiRoute(
  { auth: 'user', body: createCompanyBody, idempotent: true },
  async ({ user, body }) => {
    const result = await createOwnCompanyFor({ id: user.id, name: user.name }, body)

    if (!result.ok) {
      switch (result.kind) {
        case 'validation':
          throw new ApiError('VALIDATION_FAILED', result.error, {
            fields: { [result.field ?? '_']: result.error },
          })
        case 'deactivated':
          throw new ApiError('ACCOUNT_DEACTIVATED', result.error)
        case 'forbidden':
          throw new ApiError('FORBIDDEN', result.error)
        case 'account-missing':
          throw new ApiError('UNAUTHENTICATED', result.error)
        default:
          throw new ApiError('CONFLICT', result.error)
      }
    }

    return reply(
      {
        company: {
          id: result.id,
          name: result.companyName,
          role: 'ADMIN' as const,
          capabilities: capabilitiesFor('ADMIN'),
          industry: result.industry,
        },
      },
      { status: 201 },
    )
  },
)
