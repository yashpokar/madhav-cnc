import { effectiveRole } from '@/lib/company-roles'
import type { UserRole } from '@/generated/prisma/enums'

/** One member of a company, as far as these rules care. */
export type CompanyMember = {
  userId: string
  /** The account's own default role. A global ADMIN is a platform super-admin. */
  globalRole: UserRole
  membershipRole: UserRole | null
}

export type CompanyMembers = { id: string; name: string; members: CompanyMember[] }

export type DeletionBlock =
  | { kind: 'last-company-admin'; companyId: string; companyName: string }
  | { kind: 'last-platform-admin' }

/**
 * Whether a person may delete their account. Refused when leaving would strand
 * other people:
 *  - they are the ONLY administrator of a company that has other members
 *    (nobody left could manage the team). A company where they are the only
 *    member is fine: it simply has no members afterwards.
 *  - they are the last platform super-admin.
 * Platform super-admins do not count as a company's administrators here: the
 * people in the company would still have nobody of their own to manage them.
 */
export function deletionBlocks({
  userId,
  globalRole,
  companies,
  otherActiveSuperAdmins,
}: {
  userId: string
  globalRole: UserRole
  companies: CompanyMembers[]
  otherActiveSuperAdmins: number
}): DeletionBlock[] {
  const blocks: DeletionBlock[] = []

  for (const company of companies) {
    const me = company.members.find((m) => m.userId === userId)

    if (!me || me.globalRole === 'ADMIN') continue
    if (effectiveRole(me) !== 'ADMIN') continue

    const others = company.members.filter((m) => m.userId !== userId)

    if (others.length === 0) continue

    const otherAdmins = others.filter((m) => m.globalRole !== 'ADMIN' && effectiveRole(m) === 'ADMIN')

    if (otherAdmins.length === 0) {
      blocks.push({ kind: 'last-company-admin', companyId: company.id, companyName: company.name })
    }
  }

  if (globalRole === 'ADMIN' && otherActiveSuperAdmins === 0) {
    blocks.push({ kind: 'last-platform-admin' })
  }

  return blocks
}

/** A message a person can act on. */
export function describeDeletionBlocks(blocks: DeletionBlock[]): string {
  const parts = blocks.map((block) =>
    block.kind === 'last-company-admin'
      ? `You are the only administrator of ${block.companyName}, which has other members. Make someone else an administrator or remove the other members first.`
      : 'You are the last platform administrator. Make another administrator first.',
  )

  return parts.join(' ')
}

/** What replaces a deleted person's name and email. The email can never receive mail. */
export function anonymisedIdentity(userId: string) {
  return { name: 'Deleted user', email: `deleted+${userId}@deleted.invalid` }
}
