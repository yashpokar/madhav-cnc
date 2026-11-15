'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { forbidden } from 'next/navigation'
import { z } from 'zod'
import { logActivity } from '@/lib/activity'
import { COMPANY_COOKIE, getActiveCompanyId } from '@/lib/active-company'
import { INVITE_COOKIE } from '@/lib/invite-cookie'
import { ROLE_LABELS } from '@/lib/permissions'
import { getBaseUser, requireUser } from '@/lib/session'
import {
  acceptInvitationFor,
  createInvitationFor,
  regenerateInvitationFor,
  revokeInvitationFor,
  type AcceptResult,
  type InvitationRow,
} from '@/lib/services/invitations'
import type { UserRole } from '@/generated/prisma/enums'
import type { SimpleResult } from '@/lib/actions/quotations'

export type InviteResult =
  | { ok: true; message: string; invitation: InvitationRow }
  | { ok: false; error: string }

const hintSchema = z.object({
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email address')]).optional(),
  phone: z.string().trim().max(30).optional(),
  note: z.string().trim().max(120).optional(),
})

/**
 * An administrator of the ACTIVE company (a platform super-admin counts). The
 * company comes from the server-side active company only, never from the client.
 */
async function requireInviter() {
  const user = await requireUser()
  const companyId = await getActiveCompanyId()

  if (!companyId || user.role !== 'ADMIN') forbidden()

  return { user, companyId }
}

export async function createInvitation(input: {
  role: UserRole
  email?: string
  phone?: string
  note?: string
}): Promise<InviteResult> {
  const { user, companyId } = await requireInviter()
  const hints = hintSchema.safeParse({
    email: input.email ?? '',
    phone: input.phone ?? '',
    note: input.note ?? '',
  })

  if (!hints.success) return { ok: false, error: hints.error.issues[0].message }

  const result = await createInvitationFor({
    userId: user.id,
    companyId,
    role: input.role,
    ...hints.data,
  })

  if (!result.ok) return result

  await logActivity({
    entity: 'company',
    id: companyId,
    action: 'invitation-created',
    summary: `created an invitation to join as ${ROLE_LABELS[result.invitation.role]}`,
    actor: user,
  })

  revalidatePath('/settings/team')

  return result
}

export async function revokeInvitation(id: string): Promise<SimpleResult> {
  const { user, companyId } = await requireInviter()
  const result = await revokeInvitationFor({ userId: user.id, companyId, id: String(id) })

  if (!result.ok) return result

  await logActivity({
    entity: 'company',
    id: companyId,
    action: 'invitation-revoked',
    summary: 'revoked an invitation link',
    actor: user,
  })

  revalidatePath('/settings/team')

  return result
}

/** A fresh link (and a fresh expiry) for an unused invitation; the old link stops working. */
export async function regenerateInvitation(id: string): Promise<InviteResult> {
  const { user, companyId } = await requireInviter()
  const result = await regenerateInvitationFor({ userId: user.id, companyId, id: String(id) })

  if (!result.ok) return result

  await logActivity({
    entity: 'company',
    id: companyId,
    action: 'invitation-regenerated',
    summary: `made a new link for a ${ROLE_LABELS[result.invitation.role]} invitation`,
    actor: user,
  })

  revalidatePath('/settings/team')

  return result
}

/**
 * Accepts an invitation as the signed-in person: joins the company with the
 * invited role, makes it their active company and clears the stored invite.
 * The token alone authorises it (it is the capability); there is deliberately
 * no email match.
 */
export async function acceptInvitation(token: string): Promise<AcceptResult> {
  const person = await getBaseUser()

  if (!person) return { ok: false, error: 'Please sign in to accept this invitation' }

  const result = await acceptInvitationFor({ userId: person.id, token: String(token) })
  const jar = await cookies()

  if (!result.ok) {
    // A dead link is of no further use; do not keep steering sign-ins to it.
    jar.delete(INVITE_COOKIE)

    return result
  }

  jar.set(COMPANY_COOKIE, result.companyId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  })
  jar.delete(INVITE_COOKIE)

  revalidatePath('/', 'layout')

  return result
}
