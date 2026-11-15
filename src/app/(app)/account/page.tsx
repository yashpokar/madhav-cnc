import type { Metadata } from 'next'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { prisma } from '@/lib/prisma'
import { ROLE_LABELS } from '@/lib/permissions'
import { requireUser } from '@/lib/session'
import { AccountForms } from './account-forms'

export const metadata: Metadata = {
  title: 'My account',
}

export default async function AccountPage() {
  const user = await requireUser()

  const [memberships, credential] = await Promise.all([
    prisma.userCompany.findMany({
      where: { userId: user.id },
      select: { role: true, company: { select: { id: true, companyName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
      select: { id: true },
    }),
  ])

  const companies = memberships.map((row) => ({
    id: row.company.id,
    name: row.company.companyName,
    role: ROLE_LABELS[row.role ?? user.globalRole],
    inherited: row.role === null,
  }))

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-10">
      <div className="grid gap-2">
        <Heading>My account</Heading>
        <Text>Your profile, password and how Prodlys looks for you.</Text>
      </div>

      <AccountForms
        name={user.name}
        email={user.email}
        hasPassword={Boolean(credential)}
      />

      <section aria-labelledby="companies-heading" className="grid gap-3">
        <Subheading id="companies-heading" level={2}>
          Your companies
        </Subheading>
        {user.isSuperAdmin ? (
          <Text>You are a platform administrator with access to every company.</Text>
        ) : companies.length === 0 ? (
          <Text>You are not a member of any company yet.</Text>
        ) : (
          <ul className="divide-y divide-zinc-950/5 rounded-xl bg-white shadow-card ring-1 ring-zinc-950/5 dark:divide-white/10 dark:bg-zinc-900 dark:ring-white/10">
            {companies.map((company) => (
              <li key={company.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm/6">
                <span className="min-w-0 truncate font-medium text-zinc-950 dark:text-white">
                  {company.name}
                </span>
                <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                  {company.role}
                  {company.inherited ? ' (default role)' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
