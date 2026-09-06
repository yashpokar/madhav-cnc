'use client'

import { EllipsisHorizontalIcon } from '@heroicons/react/16/solid'
import { Avatar } from '@/components/catalyst/avatar'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownHeading,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSection,
} from '@/components/catalyst/dropdown'
import { TableCell, TableRow } from '@/components/catalyst/table'
import { ROLE_LABELS } from '@/lib/permissions'
import { UserRole } from '@/generated/prisma/enums'
import type { UserListItem } from '@/lib/queries/users'

const ROLES = Object.values(UserRole)

const ROLE_COLORS: Record<
  UserRole,
  'zinc' | 'blue' | 'amber' | 'purple' | 'green' | 'red'
> = {
  ADMIN: 'red',
  SALES: 'blue',
  OPERATOR: 'amber',
  DISPATCH: 'purple',
  ACCOUNTANT: 'green',
  VIEWER: 'zinc',
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value)
}

function signInMethodOf(user: UserListItem) {
  const providers = user.accounts.map((account) => account.providerId)
  const hasGoogle = providers.includes('google')
  const hasPassword = providers.includes('credential')

  if (hasGoogle && hasPassword) return 'Password + Google'
  if (hasGoogle) return 'Google'
  if (hasPassword) return 'Password'
  return '—'
}

export function UserRow({
  user,
  currentUserId,
  pending,
  onChangeRole,
  onDeactivate,
  onActivate,
  onReject,
}: {
  user: UserListItem
  currentUserId: string
  pending: boolean
  onChangeRole: (user: UserListItem, role: UserRole) => void
  onDeactivate: (user: UserListItem) => void
  onActivate: (user: UserListItem) => void
  onReject: (user: UserListItem) => void
}) {
  const isSelf = user.id === currentUserId

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar
            src={user.image}
            initials={user.image ? undefined : initialsOf(user.name)}
            className="size-8"
            square
            alt=""
          />
          <div className="min-w-0">
            <div className="truncate font-medium">
              {user.name}
              {isSelf ? (
                <span className="ml-2 text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                  you
                </span>
              ) : null}
            </div>
            <div className="truncate text-zinc-500 dark:text-zinc-400">
              {user.email}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {user.isActive ? (
          <Badge color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Badge>
        ) : (
          <span className="text-zinc-500 dark:text-zinc-400">—</span>
        )}
      </TableCell>
      <TableCell>
        {user.isActive ? (
          <Badge color="lime">Active</Badge>
        ) : (
          <Badge color="amber">Pending</Badge>
        )}
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">
        {signInMethodOf(user)}
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">
        {formatDate(user.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        {user.isActive ? (
          <Dropdown>
            <DropdownButton plain aria-label="User actions" disabled={pending}>
              <EllipsisHorizontalIcon />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownSection>
                <DropdownHeading>Change role</DropdownHeading>
                {ROLES.map((role) => (
                  <DropdownItem
                    key={role}
                    disabled={role === user.role}
                    onClick={() => onChangeRole(user, role)}
                  >
                    <DropdownLabel>{ROLE_LABELS[role]}</DropdownLabel>
                  </DropdownItem>
                ))}
              </DropdownSection>
              <DropdownDivider />
              <DropdownItem
                disabled={isSelf}
                onClick={() => onDeactivate(user)}
              >
                <DropdownLabel>Deactivate</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        ) : (
          <div className="flex justify-end gap-2">
            <Button onClick={() => onActivate(user)} disabled={pending}>
              Activate
            </Button>
            <Button
              plain
              onClick={() => onReject(user)}
              disabled={pending || isSelf}
            >
              Reject
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}
