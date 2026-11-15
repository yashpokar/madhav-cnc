import type { UserRole } from '@/generated/prisma/enums'

/**
 * The role a person acts with inside one company.
 *
 * A global ADMIN is a platform super-admin: administrator everywhere and the
 * only kind of person who can manage users and companies. For everyone else the
 * company's own role wins, and a company with no role set falls back to the
 * person's default role. A non-global-admin given ADMIN in one company is an
 * administrator of that company only.
 */
export function effectiveRole({
  globalRole,
  membershipRole,
}: {
  globalRole: UserRole
  membershipRole: UserRole | null | undefined
}): UserRole {
  if (globalRole === 'ADMIN') return 'ADMIN'

  return membershipRole ?? globalRole
}
