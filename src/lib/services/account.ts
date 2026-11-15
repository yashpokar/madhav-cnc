// The signed-in person's own account, for the mobile API: the profile with the
// companies they may open, and deleting the account (an app-store requirement).

import { prisma } from '@/lib/prisma'
import { capabilitiesFor } from '@/lib/permissions'
import { effectiveRole } from '@/lib/company-roles'
import { anonymisedIdentity, deletionBlocks, describeDeletionBlocks } from '@/lib/account-deletion-rules'
import type { UserRole } from '@/generated/prisma/enums'

export type MyCompany = {
  id: string
  name: string
  role: UserRole
  capabilities: readonly string[]
  industry: string
}

/** Every company the person may open (all of them for a super-admin), with their role in each. */
export async function listMyCompanies(user: {
  id: string
  globalRole: UserRole
  isSuperAdmin: boolean
}): Promise<MyCompany[]> {
  const rows = await prisma.companySetting.findMany({
    where: user.isSuperAdmin ? {} : { access: { some: { userId: user.id } } },
    select: {
      id: true,
      companyName: true,
      industry: true,
      access: { where: { userId: user.id }, select: { role: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return rows.map((row) => {
    const role = effectiveRole({ globalRole: user.globalRole, membershipRole: row.access[0]?.role })

    return {
      id: row.id,
      name: row.companyName,
      role,
      capabilities: capabilitiesFor(role),
      industry: row.industry,
    }
  })
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Deletes the account without breaking anything that points at it: the person
 * is deactivated (and stays marked as once-active so no link can bring them
 * back), signed out everywhere, removed from every company, and their name,
 * email, phone and sign-in methods are erased. The row itself stays, so the
 * quotations, orders and logs they touched keep their foreign keys.
 */
export async function deleteAccountFor(userId: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })

  if (!user) return { ok: false, error: 'Account not found' }

  const [memberships, otherSuperAdmins] = await Promise.all([
    prisma.userCompany.findMany({ where: { userId }, select: { companyId: true } }),
    prisma.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: userId } } }),
  ])

  const companies = await prisma.companySetting.findMany({
    where: { id: { in: memberships.map((m) => m.companyId) } },
    select: {
      id: true,
      companyName: true,
      access: { select: { userId: true, role: true, user: { select: { role: true } } } },
    },
  })

  const blocks = deletionBlocks({
    userId,
    globalRole: user.role,
    otherActiveSuperAdmins: otherSuperAdmins,
    companies: companies.map((company) => ({
      id: company.id,
      name: company.companyName,
      members: company.access.map((a) => ({
        userId: a.userId,
        globalRole: a.user.role,
        membershipRole: a.role,
      })),
    })),
  })

  if (blocks.length > 0) return { ok: false, error: describeDeletionBlocks(blocks) }

  const now = new Date()
  const identity = anonymisedIdentity(userId)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        ...identity,
        image: null,
        phone: null,
        employeeCode: null,
        emailVerified: false,
        role: 'VIEWER',
        isActive: false,
        // Marks the account as once-active, so it counts as deactivated.
        activatedAt: now,
      },
    }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.userCompany.deleteMany({ where: { userId } }),
    prisma.deviceToken.deleteMany({ where: { userId } }),
    // The log keeps the person's name as text; blank it. Raw because the log is
    // company-scoped and this spans every company the person ever worked in.
    prisma.$executeRaw`UPDATE activity_logs SET user_name = ${identity.name} WHERE user_id = ${userId}`,
  ])

  return { ok: true }
}
