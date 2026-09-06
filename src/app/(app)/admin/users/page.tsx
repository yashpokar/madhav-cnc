import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { listUsers } from '@/lib/queries/users'
import { requireAdmin } from '@/lib/session'
import { UsersTable } from './users-table'

export const metadata: Metadata = {
  title: 'Users',
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin()
  const users = await listUsers()
  const pending = users.filter((user) => !user.isActive).length

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Users</Heading>
          <Text>
            Anyone can register, but no one can sign in until an administrator
            activates their account and assigns a role.
          </Text>
        </div>
        {pending > 0 ? (
          <Badge color="amber">{pending} pending</Badge>
        ) : (
          <Badge color="zinc">No pending accounts</Badge>
        )}
      </div>

      <UsersTable users={users} currentUserId={admin.id} />
    </div>
  )
}
