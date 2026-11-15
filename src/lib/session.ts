import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect, forbidden } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getActiveCompanyId } from '@/lib/active-company'
import { effectiveRole } from '@/lib/company-roles'
import { can, type Action, type Resource } from '@/lib/permissions'
import type { UserRole } from '@/generated/prisma/enums'

export type CurrentUser = {
  id: string
  name: string
  email: string
  image: string | null
  /** The role in the active company (see effectiveRole). Use this for capability checks. */
  role: UserRole
  /** The person's own default role, before any per-company override. */
  globalRole: UserRole
  /** Platform super-admin: global ADMIN. Not affected by company roles. */
  isSuperAdmin: boolean
  isActive: boolean
}

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

/**
 * The signed-in person with their GLOBAL role only. The active company is
 * resolved from this (it needs to know who may open what), so it must not
 * depend on the company itself.
 */
export const getBaseUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession()

  if (!session?.user) {
    return null
  }

  const user = session.user as typeof session.user & {
    role: UserRole
    isActive: boolean
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: user.role,
    globalRole: user.role,
    isSuperAdmin: user.role === 'ADMIN',
    isActive: user.isActive,
  }
})

/** The signed-in person, acting with their role in the active company. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const base = await getBaseUser()

  if (!base || !base.isActive || base.isSuperAdmin) {
    return base
  }

  const companyId = await getActiveCompanyId()

  if (!companyId) {
    return base
  }

  const { prisma } = await import('@/lib/prisma')
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: base.id, companyId } },
    select: { role: true },
  })

  return {
    ...base,
    role: effectiveRole({
      globalRole: base.globalRole,
      membershipRole: membership?.role,
    }),
  }
})

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/sign-in')
  }

  if (!user.isActive) {
    // New accounts set up a company; deactivated ones are sent on to /pending from there.
    redirect('/onboarding')
  }

  return user
}

export async function requireCapability(
  capability: `${Resource}:${Action}`,
): Promise<CurrentUser> {
  const user = await requireUser()

  if (!can(user.role, capability)) {
    forbidden()
  }

  return user
}

/**
 * Platform super-admins only (global ADMIN, not a company-level ADMIN). Guards
 * managing users, their roles, companies and the cross-company activity log.
 */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser()

  if (!user.isSuperAdmin) {
    forbidden()
  }

  return user
}
