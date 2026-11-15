import type { Prisma } from '@/generated/prisma/client'

/**
 * Active people who may work in a company: its members, plus platform
 * super-admins (who can open every company). User is a global table, so this
 * is how a company's own staff are told apart from everyone else on the
 * platform.
 */
export function companyMemberWhere(companyId: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    OR: [{ role: 'ADMIN' }, { userCompanies: { some: { companyId } } }],
  }
}
