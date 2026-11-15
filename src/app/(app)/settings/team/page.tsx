import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { headers } from 'next/headers'
import { requireCompanyId } from '@/lib/active-company'
import { listInvitations } from '@/lib/services/invitations'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { TeamManager } from './team-manager'

export const metadata: Metadata = {
  title: 'Team',
}

export default async function TeamPage() {
  const user = await requireCapability('user:update')
  const companyId = await requireCompanyId()

  const [company, invitations, requestHeaders] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: companyId }, select: { companyName: true } }),
    listInvitations(companyId),
    headers(),
  ])

  // PUBLIC_BASE_URL when set, otherwise the address this page was opened on.
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const proto = requestHeaders.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  const baseUrl = process.env.PUBLIC_BASE_URL || (host ? `${proto}://${host}` : '')

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
    <div className="grid w-full max-w-4xl grid-cols-1 gap-6">
      <div className="grid gap-2">
        <Heading>Team</Heading>
        <Text>
          Only the people listed here can open this company. Invite someone with a link you can
          send on WhatsApp, and choose what they can do. Roles apply to this company only.
        </Text>
      </div>

      <TeamManager
        members={members}
        currentUserId={user.id}
        baseUrl={baseUrl}
        inviterName={user.name}
        companyName={company?.companyName ?? 'your company'}
        invites={invitations.map((invite) => ({
          ...invite,
          expiresAt: invite.expiresAt.toISOString(),
          createdAt: invite.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
