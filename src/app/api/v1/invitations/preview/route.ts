import { ApiError } from '@/lib/api/errors'
import { apiRoute } from '@/lib/api/handler'
import { invitationPreviewQuery } from '@/lib/api/schemas/account'
import { getPublicInvitation } from '@/lib/services/invitations'

/**
 * What the join screen shows before the person accepts: company name, role,
 * who invited them and whether the link still works. Found by token alone;
 * an unknown or malformed token is 404. Accepting is POST /invitations/accept.
 */
export const GET = apiRoute({ auth: 'user', query: invitationPreviewQuery }, async ({ query }) => {
  const invite = await getPublicInvitation(query.token)

  if (!invite) throw new ApiError('NOT_FOUND', 'This invitation link is not valid.')

  return {
    companyName: invite.companyName,
    role: invite.role,
    inviterName: invite.inviterName,
    emailHint: invite.emailHint,
    expiresAt: invite.expiresAt.toISOString(),
    status: invite.status,
    usable: invite.status === 'PENDING',
  }
})
