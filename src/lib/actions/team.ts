'use server'

import { revalidatePath } from 'next/cache'
import { forbidden } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { getActiveCompanyId } from '@/lib/active-company'
import { requireUser } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { checkAddMember, checkChangeMember } from '@/lib/team-rules'
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

async function listMembers(companyId: string) {
  const rows = await prisma.userCompany.findMany({
    where: { companyId },
    select: { userId: true, role: true, user: { select: { role: true } } },
  })

  return rows.map((row) => ({
    userId: row.userId,
    globalRole: row.user.role,
    membershipRole: row.role,
  }))
}

/**
 * Adds an existing account to the active company by exact email. Never reveals
 * anything about the account beyond whether it exists. A person still waiting
 * for approval is activated by being added; one a platform administrator
 * deactivated is not.
 */
export async function addMember(email: string, role: UserRole): Promise<SimpleResult> {
  const { user, companyId } = await requireTeamAdmin()
  const parsedEmail = emailSchema.safeParse(email)

  if (!parsedEmail.success) {
    return { ok: false, error: parsedEmail.error.issues[0].message }
  }

  const target = await prisma.user.findUnique({
    where: { email: parsedEmail.data },
    select: { id: true, email: true, role: true, isActive: true, activatedAt: true },
  })

  if (!target) {
    return { ok: false, error: 'They need to sign up first, then add them here' }
  }

  const existing = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: target.id, companyId } },
    select: { userId: true },
  })

  const rule = checkAddMember({
    role,
    targetGlobalRole: target.role,
    alreadyMember: Boolean(existing),
    targetDisabled: !target.isActive && Boolean(target.activatedAt),
  })

  if (!rule.ok) return { ok: false, error: rule.error }

  await prisma.userCompany.create({ data: { userId: target.id, companyId, role } })

  if (!target.isActive) {
    // Only a never-activated account reaches here (checked above).
    await prisma.user.update({
      where: { id: target.id },
      data: { isActive: true, activatedAt: new Date(), activatedById: user.id },
    })
  }

  await logActivity({
    entity: 'user',
    id: target.id,
    action: 'member-added',
    summary: `added ${target.email} to the team as ${ROLE_LABELS[role]}`,
    actor: user,
  })

  revalidatePath('/settings/team')

  return { ok: true, message: `${target.email} added as ${ROLE_LABELS[role]}` }
}

async function loadTarget(companyId: string, userId: string) {
  const members = await listMembers(companyId)
  const member = members.find((m) => m.userId === userId)

  if (!member) return null

  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  return person ? { members, member, email: person.email } : null
}

/** Changes a member's role in the active company only. */
export async function changeMemberRole(userId: string, role: UserRole): Promise<SimpleResult> {
  const { user, companyId } = await requireTeamAdmin()
  const loaded = await loadTarget(companyId, String(userId))

  if (!loaded) return { ok: false, error: 'That person is not on this team' }

  const rule = checkChangeMember({
    target: loaded.member,
    members: loaded.members,
    change: { type: 'role', role },
  })

  if (!rule.ok) return { ok: false, error: rule.error }

  await prisma.userCompany.update({
    where: { userId_companyId: { userId: loaded.member.userId, companyId } },
    data: { role },
  })

  await logActivity({
    entity: 'user',
    id: loaded.member.userId,
    action: 'member-role-changed',
    summary: `set ${loaded.email} to ${ROLE_LABELS[role]} in the team`,
    actor: user,
  })

  revalidatePath('/settings/team')

  return { ok: true, message: `${loaded.email} is now ${ROLE_LABELS[role]}` }
}

/** Removes a member from the active company. Their account is left as it is. */
export async function removeMember(userId: string): Promise<SimpleResult> {
  const { user, companyId } = await requireTeamAdmin()
  const loaded = await loadTarget(companyId, String(userId))

  if (!loaded) return { ok: false, error: 'That person is not on this team' }

  const rule = checkChangeMember({
    target: loaded.member,
    members: loaded.members,
    change: { type: 'remove' },
  })

  if (!rule.ok) return { ok: false, error: rule.error }

  await prisma.userCompany.delete({
    where: { userId_companyId: { userId: loaded.member.userId, companyId } },
  })

  await logActivity({
    entity: 'user',
    id: loaded.member.userId,
    action: 'member-removed',
    summary: `removed ${loaded.email} from the team`,
    actor: user,
  })

  revalidatePath('/settings/team')

  return { ok: true, message: `${loaded.email} removed` }
}
