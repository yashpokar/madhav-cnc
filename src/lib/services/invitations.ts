// Company invitations, as plain functions that take the acting user's id (and,
// for the admin side, the company) so they can be called without a web
// session. The server actions are thin wrappers that decide who is acting and
// in which company.
//
// Two kinds of caller:
//  - company administrators (create / list / revoke / regenerate): every query
//    names its companyId explicitly, so another company's rows are never seen.
//  - the invited person (read / accept by token): there may be no session or no
//    company yet, so the company scope layer filters nothing for them. These
//    use raw queries keyed only by the unguessable token, and the company is
//    taken from the invitation row itself.

import { prisma } from '@/lib/prisma'
import { newShareToken } from '@/lib/share-token'
import { effectiveRole } from '@/lib/company-roles'
import { ROLE_LABELS } from '@/lib/permissions'
import {
  checkInviteLimits,
  checkInviteRole,
  cleanHint,
  describeUnusable,
  effectiveStatus,
  expiryFrom,
  isPlausibleToken,
  type InviteStatus,
} from '@/lib/invite-rules'
import type { UserRole } from '@/generated/prisma/enums'

export type ServiceResult<T extends object = object> =
  | ({ ok: true; message: string } & T)
  | { ok: false; error: string }

const HOUR_MS = 60 * 60 * 1000

/** The role this person holds in this company (a platform super-admin is ADMIN everywhere). */
export async function roleInCompany(userId: string, companyId: string): Promise<UserRole | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  })

  if (!user || !user.isActive) return null

  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true },
  })

  if (user.role !== 'ADMIN' && !membership) return null

  return effectiveRole({ globalRole: user.role, membershipRole: membership?.role })
}

function cleanPhone(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/[^\d+]/g, '').slice(0, 20)

  return text || null
}

function cleanNote(value: string | null | undefined): string | null {
  const text = (value ?? '').trim().slice(0, 120)

  return text || null
}

export type InvitationRow = {
  id: string
  token: string
  role: UserRole
  email: string | null
  phone: string | null
  note: string | null
  status: InviteStatus
  expiresAt: Date
  createdAt: Date
}

const ROW = {
  id: true,
  token: true,
  role: true,
  email: true,
  phone: true,
  note: true,
  status: true,
  expiresAt: true,
  createdAt: true,
} as const

export async function createInvitationFor({
  userId,
  companyId,
  role,
  email,
  phone,
  note,
  now = new Date(),
}: {
  userId: string
  companyId: string
  role: unknown
  email?: string | null
  phone?: string | null
  note?: string | null
  now?: Date
}): Promise<ServiceResult<{ invitation: InvitationRow }>> {
  const inviterRole = await roleInCompany(userId, companyId)

  if (!inviterRole) return { ok: false, error: 'You cannot invite people to this company' }

  const allowed = checkInviteRole(inviterRole, role)

  if (!allowed.ok) return allowed

  return prisma.$transaction(async (tx) => {
    // Serialise invitations per company so the caps below cannot be raced past.
    await tx.$queryRaw`SELECT id FROM company_settings WHERE id = ${companyId} FOR UPDATE`

    const [pending, createdLastHour] = await Promise.all([
      tx.invitation.count({ where: { companyId, status: 'PENDING', expiresAt: { gt: now } } }),
      tx.invitation.count({
        where: { companyId, invitedById: userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
      }),
    ])
    const limits = checkInviteLimits({ pending, createdLastHour })

    if (!limits.ok) return limits

    const invitation = await tx.invitation.create({
      data: {
        companyId,
        token: newShareToken(),
        role: role as UserRole,
        email: cleanHint(email),
        phone: cleanPhone(phone),
        note: cleanNote(note),
        expiresAt: expiryFrom(now),
        invitedById: userId,
      },
      select: ROW,
    })

    return { ok: true as const, message: 'Invitation created', invitation }
  })
}

/** Pending invitations (and just-lapsed ones, so they can be resent) of one company. */
export async function listInvitations(companyId: string, now = new Date()) {
  const rows = await prisma.invitation.findMany({
    where: { companyId, status: { in: ['PENDING', 'EXPIRED'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: ROW,
  })

  return rows.map((row) => ({ ...row, status: effectiveStatus(row, now) }))
}

/** Revokes a pending invitation of this company. Anything else is "not found". */
export async function revokeInvitationFor({
  userId,
  companyId,
  id,
}: {
  userId: string
  companyId: string
  id: string
}): Promise<ServiceResult> {
  if ((await roleInCompany(userId, companyId)) !== 'ADMIN') {
    return { ok: false, error: 'Only a company administrator can do that' }
  }

  const result = await prisma.invitation.updateMany({
    where: { id, companyId, status: 'PENDING' },
    data: { status: 'REVOKED' },
  })

  if (result.count === 0) return { ok: false, error: 'That invitation is no longer open' }

  return { ok: true, message: 'Invitation revoked. The link no longer works.' }
}

/**
 * Gives an unused invitation a fresh link and a fresh expiry (the old link
 * stops working). Used to resend one that lapsed or whose link was lost.
 */
export async function regenerateInvitationFor({
  userId,
  companyId,
  id,
  now = new Date(),
}: {
  userId: string
  companyId: string
  id: string
  now?: Date
}): Promise<ServiceResult<{ invitation: InvitationRow }>> {
  if ((await roleInCompany(userId, companyId)) !== 'ADMIN') {
    return { ok: false, error: 'Only a company administrator can do that' }
  }

  const result = await prisma.invitation.updateMany({
    where: { id, companyId, status: { in: ['PENDING', 'EXPIRED'] } },
    data: { token: newShareToken(), status: 'PENDING', expiresAt: expiryFrom(now) },
  })

  if (result.count === 0) return { ok: false, error: 'That invitation is no longer open' }

  const invitation = await prisma.invitation.findFirst({ where: { id, companyId }, select: ROW })

  if (!invitation) return { ok: false, error: 'That invitation is no longer open' }

  return { ok: true, message: 'New link ready', invitation }
}

// ---------------------------------------------------------------------------
// The invited person
// ---------------------------------------------------------------------------

type PublicRow = {
  id: string
  company_id: string
  company_name: string
  role: UserRole
  email: string | null
  status: InviteStatus
  expires_at: Date
  inviter_name: string | null
}

/**
 * What the invitation page may show, found by token alone. Only the company
 * name, role, inviter's name and expiry; nothing else about the company.
 * Unknown, malformed and unusable tokens all come back as null.
 */
export async function getPublicInvitation(token: string, now = new Date()) {
  if (!isPlausibleToken(token)) return null

  const rows = await prisma.$queryRaw<PublicRow[]>`
    SELECT i.id, i.company_id, c.company_name, i.role::text AS role, i.email,
           i.status::text AS status, i.expires_at, u.name AS inviter_name
    FROM invitations i
    JOIN company_settings c ON c.id = i.company_id
    LEFT JOIN users u ON u.id = i.invited_by_id
    WHERE i.token = ${token}
    LIMIT 1`

  const row = rows[0]

  if (!row) return null

  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    role: row.role,
    emailHint: row.email,
    inviterName: row.inviter_name,
    expiresAt: row.expires_at,
    status: effectiveStatus({ status: row.status, expiresAt: row.expires_at }, now),
  }
}

export type AcceptResult = ServiceResult<{
  companyId: string
  role: UserRole
  /** True when they already had access, so nothing was used up. */
  alreadyMember: boolean
}>

const NOT_USABLE = describeUnusable('REVOKED')

/**
 * Accepts an invitation as this signed-in person. Everything happens in one
 * transaction, and the single-use claim is one conditional UPDATE, so two
 * people (or two taps) racing for the same link cannot both win.
 */
export async function acceptInvitationFor({
  userId,
  token,
  now = new Date(),
}: {
  userId: string
  token: string
  now?: Date
}): Promise<AcceptResult> {
  const invitation = await getPublicInvitation(token, now)

  if (!invitation) return { ok: false, error: NOT_USABLE }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, isActive: true, activatedAt: true },
  })

  if (!user) return { ok: false, error: 'Please sign in to accept this invitation' }

  // An account that was switched off cannot be brought back by a link.
  if (!user.isActive && user.activatedAt) {
    return { ok: false, error: 'This account cannot accept invitations. Contact an administrator.' }
  }

  const existing = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId: invitation.companyId } },
    select: { userId: true },
  })

  if (invitation.status === 'PENDING' && (existing || user.role === 'ADMIN') && user.isActive) {
    return {
      ok: true,
      message: `You already have access to ${invitation.companyName}`,
      companyId: invitation.companyId,
      role: user.role,
      alreadyMember: true,
    }
  }

  if (invitation.status !== 'PENDING') {
    return { ok: false, error: describeUnusable(invitation.status) }
  }

  try {
    const claimed = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ company_id: string; role: UserRole }[]>`
        UPDATE invitations
        SET status = 'ACCEPTED'::"InvitationStatus", accepted_by_id = ${userId}, accepted_at = ${now}
        WHERE token = ${token} AND status = 'PENDING'::"InvitationStatus" AND expires_at > ${now}
        RETURNING company_id, role::text AS role`

      const won = rows[0]

      // Someone else used it (or it was revoked) between the read above and now.
      if (!won) return null

      await tx.userCompany.upsert({
        where: { userId_companyId: { userId, companyId: won.company_id } },
        create: { userId, companyId: won.company_id, role: won.role },
        update: { role: won.role },
      })

      if (!user.isActive) {
        // Only a never-activated account reaches here (checked above).
        await tx.user.update({
          where: { id: userId },
          data: { isActive: true, activatedAt: now },
        })
      }

      // Written here, not through logActivity: a brand-new person has no active
      // company yet, so the scope layer would not stamp one for them.
      await tx.activityLog.create({
        data: {
          companyId: won.company_id,
          entityType: 'user',
          entityId: userId,
          action: 'member-joined',
          summary: `joined the team as ${ROLE_LABELS[won.role]} using an invitation`,
          userId,
          userName: user.name,
        },
      })

      return won
    })

    if (!claimed) {
      const again = await getPublicInvitation(token, now)

      return { ok: false, error: describeUnusable(again?.status ?? 'REVOKED') }
    }

    return {
      ok: true,
      message: `Welcome to ${invitation.companyName}`,
      companyId: claimed.company_id,
      role: claimed.role,
      alreadyMember: false,
    }
  } catch {
    return { ok: false, error: 'Could not accept the invitation. Please try again.' }
  }
}
