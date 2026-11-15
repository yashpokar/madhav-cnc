import { apiRoute } from '@/lib/api/handler'
import { unwrapService } from '@/lib/api/errors'
import { acceptInvitationBody } from '@/lib/api/schemas'
import { acceptInvitationFor } from '@/lib/services/invitations'

/** Joins the company an invitation link was made for. The link works once. */
export const POST = apiRoute(
  { auth: 'user', body: acceptInvitationBody, idempotent: true },
  async ({ user, body }) => {
    const result = unwrapService(await acceptInvitationFor({ userId: user.id, token: body.token }))

    return {
      companyId: result.companyId,
      role: result.role,
      alreadyMember: result.alreadyMember,
      message: result.message,
    }
  },
)
