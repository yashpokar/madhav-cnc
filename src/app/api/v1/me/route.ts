import { apiRoute } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { deleteAccountFor, listMyCompanies } from '@/lib/services/account'

export const GET = apiRoute({ auth: 'user' }, async ({ user }) => ({
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    globalRole: user.globalRole,
    isSuperAdmin: user.isSuperAdmin,
  },
  companies: await listMyCompanies(user),
}))

/**
 * Deletes the signed-in person's account (required by the app stores). Refused
 * with 409 when they are the last administrator of a company that has other
 * members.
 */
export const DELETE = apiRoute({ auth: 'user' }, async ({ user }) => {
  const result = await deleteAccountFor(user.id)

  if (!result.ok) throw new DomainError(result.error, 'CONFLICT')

  return { deleted: true as const }
})
