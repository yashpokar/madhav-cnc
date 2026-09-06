import { Badge } from '@/components/catalyst/badge'
import { Divider } from '@/components/catalyst/divider'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Link } from '@/components/catalyst/link'
import { Text } from '@/components/catalyst/text'
import { ADMIN_ENTRIES, NAV_ENTRIES } from '@/lib/navigation'
import { can, ROLE_LABELS } from '@/lib/permissions'
import { countPendingUsers } from '@/lib/queries/users'
import { requireUser } from '@/lib/session'

export default async function DashboardPage() {
  const user = await requireUser()
  const isAdmin = can(user.role, 'user:update')
  const pendingCount = isAdmin ? await countPendingUsers() : 0

  const modules = NAV_ENTRIES.filter(
    (entry) => entry.href !== '/' && can(user.role, entry.capability),
  )

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Welcome back, {user.name.split(' ')[0]}</Heading>
        <Text>
          You are signed in as <Badge color="zinc">{ROLE_LABELS[user.role]}</Badge>
        </Text>
      </div>

      {isAdmin && pendingCount > 0 ? (
        <div className="rounded-lg bg-amber-50 p-4 ring-1 ring-amber-950/10 dark:bg-amber-400/10 dark:ring-amber-400/20">
          <Subheading level={2}>
            {pendingCount} account{pendingCount === 1 ? '' : 's'} awaiting approval
          </Subheading>
          <Text className="mt-1">
            <Link
              href="/admin/users"
              className="font-medium text-zinc-950 underline decoration-zinc-950/30 dark:text-white dark:decoration-white/30"
            >
              Review pending users
            </Link>
          </Text>
        </div>
      ) : null}

      <Divider />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="rounded-lg p-4 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:ring-white/10 dark:hover:bg-white/5"
          >
            <Subheading level={2}>{entry.label}</Subheading>
            <Text className="mt-1">
              {can(user.role, `${entry.capability.split(':')[0]}:create` as never)
                ? 'Create and manage records'
                : 'View records'}
            </Text>
          </Link>
        ))}
        {ADMIN_ENTRIES.filter((entry) => can(user.role, entry.capability)).map(
          (entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="rounded-lg p-4 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:ring-white/10 dark:hover:bg-white/5"
            >
              <Subheading level={2}>{entry.label}</Subheading>
              <Text className="mt-1">Activate accounts and assign roles</Text>
            </Link>
          ),
        )}
      </div>
    </div>
  )
}
