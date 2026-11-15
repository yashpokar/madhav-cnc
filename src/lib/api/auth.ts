import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listAccessibleCompanies } from '@/lib/active-company'
import { effectiveRole } from '@/lib/company-roles'
import { can, type Action, type Resource } from '@/lib/permissions'
import { ApiError } from '@/lib/api/errors'
import type { UserRole } from '@/generated/prisma/enums'

/**
 * Authentication for the mobile API. Unlike src/lib/session.ts these NEVER call
 * redirect() or forbidden(): a phone needs a JSON error with a code, not a
 * redirect to a web page.
 */

export const COMPANY_HEADER = 'X-Company-Id'

export type ApiUser = {
  id: string
  name: string
  email: string
  image: string | null
  /** The role in the chosen company (effectiveRole); the global role when none is chosen. */
  role: UserRole
  /** The person's own default role, before any per-company override. */
  globalRole: UserRole
  /** Platform super-admin: global ADMIN. */
  isSuperAdmin: boolean
  isActive: boolean
}

/**
 * A deactivated account is one a platform administrator switched off after it
 * was active once. A brand-new account (never activated) is not deactivated:
 * it may sign in and create or join a company.
 */
export function isDeactivated(account: { isActive: boolean; activatedAt?: Date | string | null }) {
  return !account.isActive && Boolean(account.activatedAt)
}

/** Which of the companies the person may open `requested` is. Throws otherwise (never a fallback). */
export function resolveCompanyId(accessible: readonly { id: string }[], requested: string | null): string {
  const id = requested?.trim()

  if (!id) {
    throw new ApiError('COMPANY_REQUIRED', `Send the company you are working in as the ${COMPANY_HEADER} header.`)
  }

  if (!accessible.some((company) => company.id === id)) {
    // Same answer for "does not exist" and "not yours": do not reveal which.
    throw new ApiError('COMPANY_NOT_ACCESSIBLE', 'You do not have access to that company.')
  }

  return id
}

/** The signed-in person from `Authorization: Bearer <token>` (or a session cookie). */
export async function requireApiUser(request: Request): Promise<ApiUser> {
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
  }

  const row = session.user as typeof session.user & {
    role: UserRole
    isActive: boolean
    activatedAt?: Date | string | null
  }

  if (isDeactivated(row)) {
    throw new ApiError('ACCOUNT_DEACTIVATED', 'Your account has been deactivated. Contact an administrator.')
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image ?? null,
    role: row.role,
    globalRole: row.role,
    isSuperAdmin: row.role === 'ADMIN',
    isActive: row.isActive,
  }
}

/**
 * Reads X-Company-Id, checks the person may open that company, and returns the
 * company with the person's effective role in it.
 */
export async function requireApiCompany(
  user: ApiUser,
  request: Request,
): Promise<{ companyId: string; user: ApiUser }> {
  const accessible = await listAccessibleCompanies(user, prisma)
  const companyId = resolveCompanyId(accessible, request.headers.get(COMPANY_HEADER))

  if (user.isSuperAdmin) return { companyId, user }

  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
    select: { role: true },
  })

  return {
    companyId,
    user: { ...user, role: effectiveRole({ globalRole: user.globalRole, membershipRole: membership?.role }) },
  }
}

/** Throws FORBIDDEN (403) unless the person's role in the company grants the capability. */
export function requireApiCapability(user: ApiUser, capability: `${Resource}:${Action}`): void {
  if (!can(user.role, capability)) {
    throw new ApiError('FORBIDDEN', 'You do not have permission to do that.')
  }
}
