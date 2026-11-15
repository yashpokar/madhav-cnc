// The team of one company: who is on it, adding, changing and removing people,
// and the invitation links (with their activity log lines). Plain functions that
// take the acting user and the company, so the web server actions and the mobile
// API share one implementation. Permission (administrator) is checked by the caller.

import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { ROLE_LABELS } from '@/lib/permissions'
import { checkAddMember, checkChangeMember } from '@/lib/team-rules'
import {
  createInvitationFor,
  listInvitations,
  regenerateInvitationFor,
  revokeInvitationFor,
  type InvitationRow,
} from '@/lib/services/invitations'
import type { UserRole } from '@/generated/prisma/enums'

export type TeamActor = { id: string; name: string }

type Refusal = {
  ok: false
  error: string
  /** Set when the refusal is not a plain state conflict (the API maps it to 404 or 422). */
  code?: 'NOT_FOUND' | 'VALIDATION_FAILED'
  fieldErrors?: Record<string, string>
}

export type TeamResult = { ok: true; message: string } | Refusal

export type InviteResult =
  | { ok: true; message: string; invitation: InvitationRow }
  | { ok: false; error: string }

export type TeamMember = {
  id: string
  name: string
  email: string
  isSuperAdmin: boolean
  role: UserRole
}

/** The people who can open this company, oldest first. The role is the company role, else the person's default. */
export async function listTeamMembers(companyId: string): Promise<TeamMember[]> {
  const rows = await prisma.userCompany.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  })

  return rows.map((row) => ({
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    isSuperAdmin: row.user.role === 'ADMIN',
    role: row.user.role === 'ADMIN' ? ('ADMIN' as const) : (row.role ?? row.user.role),
  }))
}

export { listInvitations }

async function membersOf(companyId: string) {
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

async function loadTarget(companyId: string, userId: string) {
  const members = await membersOf(companyId)
  const member = members.find((m) => m.userId === userId)

  if (!member) return null

  const person = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })

  return person ? { members, member, email: person.email } : null
}

/**
 * Adds an existing account to the company by exact email. Never reveals
 * anything about the account beyond whether it exists. A person still waiting
 * for approval is activated by being added; one a platform administrator
 * deactivated is not. `email` is already trimmed and lower-cased.
 */
export async function addMemberFor(
  actor: TeamActor,
  companyId: string,
  email: string,
  role: UserRole,
): Promise<TeamResult> {
  const target = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, isActive: true, activatedAt: true },
  })

  if (!target) {
    return {
      ok: false,
      error: 'They need to sign up first, then add them here',
      code: 'VALIDATION_FAILED',
      fieldErrors: { email: 'They need to sign up first, then add them here' },
    }
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
      data: { isActive: true, activatedAt: new Date(), activatedById: actor.id },
    })
  }

  await logActivity({
    entity: 'user',
    id: target.id,
    action: 'member-added',
    summary: `added ${target.email} to the team as ${ROLE_LABELS[role]}`,
    actor,
  })

  return { ok: true, message: `${target.email} added as ${ROLE_LABELS[role]}` }
}

/** Changes a member's role in this company only. */
export async function changeMemberRoleFor(
  actor: TeamActor,
  companyId: string,
  userId: string,
  role: UserRole,
): Promise<TeamResult> {
  const loaded = await loadTarget(companyId, userId)

  if (!loaded) return { ok: false, error: 'That person is not on this team', code: 'NOT_FOUND' }

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
    actor,
  })

  return { ok: true, message: `${loaded.email} is now ${ROLE_LABELS[role]}` }
}

/** Removes a member from this company. Their account is left as it is. */
export async function removeMemberFor(
  actor: TeamActor,
  companyId: string,
  userId: string,
): Promise<TeamResult> {
  const loaded = await loadTarget(companyId, userId)

  if (!loaded) return { ok: false, error: 'That person is not on this team', code: 'NOT_FOUND' }

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
    actor,
  })

  return { ok: true, message: `${loaded.email} removed` }
}

export async function inviteFor(
  actor: TeamActor,
  companyId: string,
  input: { role: UserRole; email?: string | null; phone?: string | null; note?: string | null },
): Promise<InviteResult> {
  const result = await createInvitationFor({ userId: actor.id, companyId, ...input })

  if (!result.ok) return result

  await logActivity({
    entity: 'company',
    id: companyId,
    action: 'invitation-created',
    summary: `created an invitation to join as ${ROLE_LABELS[result.invitation.role]}`,
    actor,
  })

  return result
}

export async function revokeInviteFor(actor: TeamActor, companyId: string, id: string): Promise<TeamResult> {
  const result = await revokeInvitationFor({ userId: actor.id, companyId, id })

  if (!result.ok) return result

  await logActivity({
    entity: 'company',
    id: companyId,
    action: 'invitation-revoked',
    summary: 'revoked an invitation link',
    actor,
  })

  return result
}

/** A fresh link (and expiry) for an unused invitation; the old link stops working. */
export async function regenerateInviteFor(actor: TeamActor, companyId: string, id: string): Promise<InviteResult> {
  const result = await regenerateInvitationFor({ userId: actor.id, companyId, id })

  if (!result.ok) return result

  await logActivity({
    entity: 'company',
    id: companyId,
    action: 'invitation-regenerated',
    summary: `made a new link for a ${ROLE_LABELS[result.invitation.role]} invitation`,
    actor,
  })

  return result
}
