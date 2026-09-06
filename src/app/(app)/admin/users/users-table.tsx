'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog'
import { Field, Label } from '@/components/catalyst/fieldset'
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { Text } from '@/components/catalyst/text'
import {
  activateUser,
  changeUserRole,
  deactivateUser,
  rejectUser,
  type ActionResult,
} from '@/lib/actions/users'
import { ROLE_LABELS } from '@/lib/permissions'
import { UserRole } from '@/generated/prisma/enums'
import type { UserListItem } from '@/lib/queries/users'
import { UserRow } from './user-rows'

const ROLES = Object.values(UserRole)

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserListItem[]
  currentUserId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [activateTarget, setActivateTarget] = useState<UserListItem | null>(null)
  const [rejectTarget, setRejectTarget] = useState<UserListItem | null>(null)
  const [chosenRole, setChosenRole] = useState<UserRole>('VIEWER')

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const outcome = await action()
      setResult(outcome)

      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {result ? (
        <div
          role="status"
          className={
            result.ok
              ? 'rounded-lg bg-lime-50 px-4 py-3 text-sm/6 text-lime-900 ring-1 ring-lime-950/10 dark:bg-lime-400/10 dark:text-lime-200 dark:ring-lime-400/20'
              : 'rounded-lg bg-red-50 px-4 py-3 text-sm/6 text-red-900 ring-1 ring-red-950/10 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/20'
          }
        >
          {result.ok ? result.message : result.error}
        </div>
      ) : null}

      <Table dense grid striped>
        <TableHead>
          <TableRow>
            <TableHeader>User</TableHeader>
            <TableHeader>Role</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Sign-in</TableHeader>
            <TableHeader>Registered</TableHeader>
            <TableHeader className="text-right">Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              currentUserId={currentUserId}
              pending={pending}
              onChangeRole={(target, role) =>
                run(() => changeUserRole(target.id, role))
              }
              onDeactivate={(target) => run(() => deactivateUser(target.id))}
              onActivate={(target) => {
                setChosenRole('VIEWER')
                setActivateTarget(target)
              }}
              onReject={setRejectTarget}
            />
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={activateTarget !== null}
        onClose={() => setActivateTarget(null)}
      >
        <DialogTitle>Activate {activateTarget?.name}</DialogTitle>
        <DialogDescription>
          Choose the role this account will have. They can sign in as soon as it
          is saved.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Role</Label>
            <Listbox
              value={chosenRole}
              onChange={(value) => setChosenRole(value as UserRole)}
            >
              {ROLES.map((role) => (
                <ListboxOption key={role} value={role}>
                  <ListboxLabel>{ROLE_LABELS[role]}</ListboxLabel>
                </ListboxOption>
              ))}
            </Listbox>
          </Field>
          <Text className="mt-4">{activateTarget?.email}</Text>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setActivateTarget(null)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              const target = activateTarget
              setActivateTarget(null)

              if (target) {
                run(() => activateUser(target.id, chosenRole))
              }
            }}
          >
            Activate
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rejectTarget !== null} onClose={() => setRejectTarget(null)}>
        <DialogTitle>Reject {rejectTarget?.name}?</DialogTitle>
        <DialogDescription>
          This permanently deletes the pending account for {rejectTarget?.email}.
          They can register again later.
        </DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setRejectTarget(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={pending}
            onClick={() => {
              const target = rejectTarget
              setRejectTarget(null)

              if (target) {
                run(() => rejectUser(target.id))
              }
            }}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
