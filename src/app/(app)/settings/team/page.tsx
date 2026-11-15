import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { requireCompanyId } from '@/lib/active-company'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { TeamManager } from './team-manager'

export const metadata: Metadata = {
  title: 'Team',
}

export default async function TeamPage() {
  const user = await requireCapability('user:update')
  const companyId = await requireCompanyId()

  const rows = await prisma.userCompany.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  })

  const members = rows.map((row) => ({
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    isSuperAdmin: row.user.role === 'ADMIN',
    // Same rule as everywhere else: the company role, else the person's default.
    role: row.user.role === 'ADMIN' ? ('ADMIN' as const) : (row.role ?? row.user.role),
  }))

  return (
    <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8">
      <div className="grid gap-2">
        <Heading>Team</Heading>
        <Text>
          Only the people listed here can open this company. Add someone who already has an
          account by their email, and choose what they can do. Roles apply to this company only.
        </Text>
      </div>

      <TeamManager members={members} currentUserId={user.id} />
    </div>
  )
}
