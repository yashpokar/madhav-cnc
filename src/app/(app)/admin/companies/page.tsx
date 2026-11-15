import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/session'
import { CompaniesManager } from './companies-manager'

export const metadata: Metadata = {
  title: 'Companies',
}

export default async function AdminCompaniesPage() {
  await requireSuperAdmin()

  const [companies, users, access] = await Promise.all([
    prisma.companySetting.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, companyName: true, gstin: true, city: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: 'ADMIN' } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.userCompany.findMany({ select: { userId: true, companyId: true, role: true } }),
  ])

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-2">
        <Heading>Companies</Heading>
        <Text>
          Each company has its own customers, items, orders, invoices, payments and numbering.
          Administrators can open every company; everyone else only the ones ticked here, with the role chosen for each company
          (or their default role).
        </Text>
      </div>

      <CompaniesManager
        companies={companies}
        users={users}
        granted={access.map((row) => ({
          key: `${row.userId}:${row.companyId}`,
          role: row.role,
        }))}
      />
    </div>
  )
}
