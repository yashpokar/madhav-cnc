import type { Metadata } from 'next'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { EmptyState } from '@/components/form-banner'
import { FilterSelect } from '@/components/filter-select'
import { Pagination } from '@/components/pagination'
import { SearchField } from '@/components/search-field'
import { paginate } from '@/lib/pagination'
import { ROLE_LABELS } from '@/lib/permissions'
import { listUsers } from '@/lib/queries/users'
import { requireSuperAdmin } from '@/lib/session'
import { sortRows } from '@/lib/table-sort'
import { UserRole } from '@/generated/prisma/enums'
import { UsersTable } from './users-table'

export const metadata: Metadata = {
  title: 'Users',
}

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) || undefined

export default async function AdminUsersPage({
  searchParams,
}: PageProps<'/admin/users'>) {
  const admin = await requireSuperAdmin()
  const params = await searchParams
  const users = await listUsers()
  const pending = users.filter((user) => !user.isActive).length

  const q = one(params.q)?.trim().toLowerCase()
  const role = Object.values(UserRole).find((value) => value === one(params.role))
  const status = one(params.status) === 'active' || one(params.status) === 'pending' ? one(params.status) : undefined
  const filtered = Boolean(q || role || status)

  const matching = users.filter(
    (user) =>
      (!role || (user.isActive && user.role === role)) &&
      (!status || (status === 'active') === user.isActive) &&
      (!q ||
        [user.name, user.email, user.phone, user.employeeCode, ROLE_LABELS[user.role]].some(
          (field) => field?.toLowerCase().includes(q),
        )),
  )
  const sorted = sortRows(matching, params, {
    name: (user) => user.name,
    email: (user) => user.email,
    role: (user) => (user.isActive ? ROLE_LABELS[user.role] : null),
    status: (user) => (user.isActive ? 'Active' : 'Pending'),
    signin: (user) => user.accounts.map((account) => account.providerId).sort().join(' '),
    created: (user) => user.createdAt,
  })
  const paged = paginate(sorted, params)

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Users</Heading>
          <Text>
            Anyone can register, but no one can sign in until an administrator
            activates their account and assigns a default role. A different role
            for a particular company can be set under Companies.
          </Text>
        </div>
        {pending > 0 ? (
          <Badge color="amber">{pending} pending</Badge>
        ) : (
          <Badge color="zinc">No pending accounts</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField placeholder="Search name, email, phone…" />
          <FilterSelect
            param="role"
            label="Role"
            allLabel="All"
            value={role}
            options={Object.values(UserRole).map((value) => ({
              value,
              label: ROLE_LABELS[value],
            }))}
          />
          <FilterSelect
            param="status"
            label="Status"
            allLabel="Any"
            value={status}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'pending', label: 'Pending' },
            ]}
          />
        </div>

        {filtered && sorted.length > 0 ? (
          <p className="text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400">
            {sorted.length} of {users.length} user{users.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matches' : 'No users yet'}
          description={
            filtered
              ? 'No users fit the current search and filters.'
              : 'Accounts appear here as soon as someone registers.'
          }
          action={
            filtered ? (
              <Button outline href="/admin/users">
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <div>
          <UsersTable users={paged.rows} currentUserId={admin.id} params={params} />
          <Pagination paged={paged} params={params} pathname="/admin/users" />
        </div>
      )}
    </div>
  )
}
