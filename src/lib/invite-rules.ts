import type { UserRole } from '@/generated/prisma/enums'
import { ROLE_LABELS } from '@/lib/permissions'
import { isValidRole, type RuleResult } from '@/lib/team-rules'

/** Days an invitation link stays usable. */
export const INVITE_VALID_DAYS = 7
/** Most pending (unused, unexpired) invitations one company may hold. */
export const MAX_PENDING_INVITES = 50
/** Most invitations one person may create per rolling hour. */
export const MAX_INVITES_PER_HOUR = 20

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

/** One line per role for the invite dialog: what that person will be able to do. */
export const ROLE_BLURBS: Record<UserRole, string> = {
  ADMIN: 'Everything, including managing the team and settings.',
  SALES: 'Customers, partners, quotations and orders. Can view production, dispatch, invoices and stock.',
  OPERATOR: 'Updates production work. Can view orders, customers and stock.',
  DISPATCH: 'Dispatch and stock. Can view orders, production and purchases.',
  ACCOUNTANT: 'Invoices, payments, expenses, purchases and notes. Can view orders and stock.',
  VIEWER: 'Can look at everything but change nothing.',
}

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Whether someone acting with `inviterRole` in a company may invite a person
 * with `role`. Only an administrator of the company invites, and that is the
 * only way to grant ADMIN; nobody can grant more than they hold. Note an
 * invitation only ever makes a company membership, never a platform
 * administrator, whatever role it carries.
 */
export function checkInviteRole(inviterRole: UserRole, role: unknown): RuleResult {
  if (!isValidRole(role)) return { ok: false, error: 'Unknown role' }
  if (inviterRole !== 'ADMIN') {
    return { ok: false, error: 'Only a company administrator can invite people' }
  }

  return { ok: true }
}

/** What to do with the pending count and the hourly count before creating one more. */
export function checkInviteLimits({
  pending,
  createdLastHour,
}: {
  pending: number
  createdLastHour: number
}): RuleResult {
  if (createdLastHour >= MAX_INVITES_PER_HOUR) {
    return { ok: false, error: 'You have created a lot of invitations in the last hour. Try again later.' }
  }
  if (pending >= MAX_PENDING_INVITES) {
    return {
      ok: false,
      error: `This company already has ${MAX_PENDING_INVITES} open invitations. Revoke some you no longer need.`,
    }
  }

  return { ok: true }
}

/** A stored status, with a pending invitation past its expiry read as expired. */
export function effectiveStatus(
  invite: { status: InviteStatus; expiresAt: Date },
  now: Date,
): InviteStatus {
  if (invite.status === 'PENDING' && invite.expiresAt.getTime() <= now.getTime()) return 'EXPIRED'

  return invite.status
}

/** Whether the invitation can still be accepted. */
export function isAcceptable(invite: { status: InviteStatus; expiresAt: Date }, now: Date): boolean {
  return effectiveStatus(invite, now) === 'PENDING'
}

const TRANSITIONS: Record<InviteStatus, readonly InviteStatus[]> = {
  PENDING: ['ACCEPTED', 'REVOKED', 'EXPIRED'],
  // A lapsed link can be sent again (regenerated) but never accepted as it was.
  EXPIRED: ['PENDING'],
  ACCEPTED: [],
  REVOKED: [],
}

export function canTransition(from: InviteStatus, to: InviteStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** The only wording shown to someone who holds a link that cannot be used. */
export function describeUnusable(status: InviteStatus): string {
  return status === 'ACCEPTED'
    ? 'This invitation has already been used. Ask for a new one if you need access.'
    : 'This invitation link is invalid or has expired. Ask for a new one.'
}

/** Shape check so obviously wrong tokens never reach the database. */
export function isPlausibleToken(token: unknown): token is string {
  return typeof token === 'string' && /^[a-z2-7]{32}$/.test(token)
}

/** The shareable link. `baseUrl` is PUBLIC_BASE_URL on the server or the page origin in the browser. */
export function inviteUrl(baseUrl: string | null | undefined, token: string): string {
  const base = (baseUrl ?? '').trim().replace(/\/+$/, '')

  return `${base}/join/${token}`
}

/** First word of a name, for showing who invited someone. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'Someone'
}

/** The WhatsApp message. The link is alone on the last line so it previews and taps cleanly. */
export function inviteMessage({
  inviter,
  company,
  role,
  url,
}: {
  inviter: string
  company: string
  role: UserRole
  url: string
}): string {
  return `${firstName(inviter)} invited you to join ${company} on Prodlys as ${ROLE_LABELS[role]}. Tap to join:\n${url}`
}

/** Lowercased, trimmed optional email hint; empty becomes null. */
export function cleanHint(value: string | null | undefined): string | null {
  const text = (value ?? '').trim().toLowerCase()

  return text ? text : null
}

/** Whether an email hint exists and differs from the signed-in person's email. */
export function emailDiffers(hint: string | null | undefined, actual: string): boolean {
  const wanted = cleanHint(hint)

  return Boolean(wanted) && wanted !== actual.trim().toLowerCase()
}
