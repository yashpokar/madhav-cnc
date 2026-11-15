'use server'

// Thin web adapter: who is acting (an administrator of the active company),
// then src/lib/services/team.ts, then cache refresh.

import { revalidatePath } from 'next/cache'
import { forbidden } from 'next/navigation'
import { z } from 'zod'
import { getActiveCompanyId } from '@/lib/active-company'
import { requireUser } from '@/lib/session'
import { addMemberFor, changeMemberRoleFor, removeMemberFor } from '@/lib/services/team'
import type { UserRole } from '@/generated/prisma/enums'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address')

/**
 * Whoever is an administrator of the ACTIVE company (a platform super-admin
 * counts). The company comes from the server-side active company only, never
 * from the client, so a request cannot aim at another company.
 */
async function requireTeamAdmin() {
  const user = await requireUser()
  const companyId = await getActiveCompanyId()

  if (!companyId || user.role !== 'ADMIN') forbidden()

  return { user, companyId }
}

/** Adds an existing account to the active company by exact email. */
export async function addMember(email: string, role: UserRole): Promise<SimpleResult> {
  const { user, companyId } = await requireTeamAdmin()
  const parsedEmail = emailSchema.safeParse(email)

  if (!parsedEmail.success) {
    return { ok: false, error: parsedEmail.error.issues[0].message }
  }

  const result = await addMemberFor(user, companyId, parsedEmail.data, role)

  if (result.ok) revalidatePath('/settings/team')

  return result
}

/** Changes a member's role in the active company only. */
export async function changeMemberRole(userId: string, role: UserRole): Promise<SimpleResult> {
  const { user, companyId } = await requireTeamAdmin()
  const result = await changeMemberRoleFor(user, companyId, String(userId), role)

  if (result.ok) revalidatePath('/settings/team')

  return result
}

/** Removes a member from the active company. Their account is left as it is. */
export async function removeMember(userId: string): Promise<SimpleResult> {
  const { user, companyId } = await requireTeamAdmin()
  const result = await removeMemberFor(user, companyId, String(userId))

  if (result.ok) revalidatePath('/settings/team')

  return result
}
