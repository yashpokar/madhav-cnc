import { AppShell } from '@/components/app-shell'
import { getActiveCompanyId, listAccessibleCompanies } from '@/lib/active-company'
import { ADMIN_ENTRIES, NAV_ENTRIES } from '@/lib/navigation'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  const nav = NAV_ENTRIES.filter((entry) => can(user.role, entry.capability))
  const adminNav = ADMIN_ENTRIES.filter((entry) =>
    can(user.role, entry.capability),
  )
  const [companies, activeCompanyId] = await Promise.all([
    listAccessibleCompanies(user, prisma),
    getActiveCompanyId(),
  ])

  return (
    <AppShell
      user={user}
      nav={nav}
      adminNav={adminNav}
      companies={companies}
      activeCompanyId={activeCompanyId}
    >
      {activeCompanyId ? (
        children
      ) : (
        <div className="mx-auto max-w-md py-16 text-center">
          <h1 className="text-lg/7 font-semibold">No company yet</h1>
          <p className="mt-2 text-sm/6 text-zinc-500">
            Your account is not linked to a company. Ask an administrator to give you access.
          </p>
        </div>
      )}
    </AppShell>
  )
}
