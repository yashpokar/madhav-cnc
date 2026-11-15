import { UserRole } from '@/generated/prisma/enums'
import { effectiveRole } from '@/lib/company-roles'

/** Most companies one person may create for themselves (super-admins are exempt). */
export const MAX_SELF_COMPANIES = 3

export type RuleResult = { ok: true } | { ok: false; error: string }

const ROLES = new Set<string>(Object.values(UserRole))

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && ROLES.has(role)
}

export function canCreateAnotherCompany(createdSoFar: number): boolean {
  return createdSoFar < MAX_SELF_COMPANIES
}

type Member = {
  /** The account's own default role. A global ADMIN is a platform super-admin. */
  globalRole: UserRole
  /** The role set for them in this company, if any. */
  membershipRole: UserRole | null
}

/** How many people hold ADMIN in the company (super-admins are not members). */
export function countCompanyAdmins(members: Member[]): number {
  return members.filter(
    (m) => m.globalRole !== 'ADMIN' && effectiveRole(m) === 'ADMIN',
  ).length
}

/** Whether a company administrator may add this account as a member. */
export function checkAddMember({
  role,
  targetGlobalRole,
  alreadyMember,
  targetDisabled,
}: {
  role: unknown
  targetGlobalRole: UserRole
  alreadyMember: boolean
  /** Deactivated by a platform administrator: cannot be brought back from here. */
  targetDisabled: boolean
}): RuleResult {
  if (!isValidRole(role)) return { ok: false, error: 'Unknown role' }
  // One message for both, so nothing is revealed about the account.
  if (targetGlobalRole === 'ADMIN' || targetDisabled) {
    return { ok: false, error: 'That account cannot be added here' }
  }
  if (alreadyMember) return { ok: false, error: 'They are already a member' }

  return { ok: true }
}

/**
 * Whether a company administrator may change or remove an existing member.
 * `members` is everyone currently in the company, including the target.
 */
export function checkChangeMember({
  target,
  members,
  change,
}: {
  target: Member
  members: Member[]
  change: { type: 'remove' } | { type: 'role'; role: unknown }
}): RuleResult {
  if (change.type === 'role' && !isValidRole(change.role)) {
    return { ok: false, error: 'Unknown role' }
  }
  if (target.globalRole === 'ADMIN') {
    return { ok: false, error: 'Platform administrators cannot be changed here' }
  }

  const staysAdmin = change.type === 'role' && change.role === 'ADMIN'

  if (effectiveRole(target) === 'ADMIN' && !staysAdmin && countCompanyAdmins(members) <= 1) {
    return {
      ok: false,
      error: 'A company needs at least one administrator. Make someone else an administrator first.',
    }
  }

  return { ok: true }
}
