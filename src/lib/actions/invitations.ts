'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { forbidden } from 'next/navigation'
import { z } from 'zod'
import { COMPANY_COOKIE, getActiveCompanyId } from '@/lib/active-company'
import { INVITE_COOKIE } from '@/lib/invite-cookie'
import { getBaseUser, requireUser } from '@/lib/session'
import { acceptInvitationFor, type AcceptResult } from '@/lib/services/invitations'
import { inviteFor, regenerateInviteFor, revokeInviteFor, type InviteResult } from '@/lib/services/team'
import type { UserRole } from '@/generated/prisma/enums'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { InviteResult }

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

  const result = await inviteFor(user, companyId, { role: input.role, ...hints.data })

  if (result.ok) revalidatePath('/settings/team')

  return result
}

export async function revokeInvitation(id: string): Promise<SimpleResult> {
  const { user, companyId } = await requireInviter()
  const result = await revokeInviteFor(user, companyId, String(id))

  if (result.ok) revalidatePath('/settings/team')

  return result
}

/** A fresh link (and a fresh expiry) for an unused invitation; the old link stops working. */
export async function regenerateInvitation(id: string): Promise<InviteResult> {
  const { user, companyId } = await requireInviter()
  const result = await regenerateInviteFor(user, companyId, String(id))

  if (result.ok) revalidatePath('/settings/team')

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
