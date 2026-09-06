import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect, forbidden } from 'next/navigation'
import { auth } from '@/lib/auth'
import { can, type Action, type Resource } from '@/lib/permissions'
import type { UserRole } from '@/generated/prisma/enums'

export type CurrentUser = {
  id: string
  name: string
  email: string
  image: string | null
  role: UserRole
  isActive: boolean
}

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export async function getCurrentUser(): Promise<CurrentUser | null> {
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
    isActive: user.isActive,
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/sign-in')
  }

  if (!user.isActive) {
    redirect('/pending')
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

export async function requireAdmin(): Promise<CurrentUser> {
  return requireCapability('user:update')
}
