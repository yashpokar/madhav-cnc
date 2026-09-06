import { AppShell } from '@/components/app-shell'
import { ADMIN_ENTRIES, NAV_ENTRIES } from '@/lib/navigation'
import { can } from '@/lib/permissions'
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

  return (
    <AppShell user={user} nav={nav} adminNav={adminNav}>
      {children}
    </AppShell>
  )
}
