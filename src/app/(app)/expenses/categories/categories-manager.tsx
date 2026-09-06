'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/16/solid'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/catalyst/dialog'
import {
  Description,
  ErrorMessage,
  Field,
  FieldGroup,
  Label,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Switch, SwitchField } from '@/components/catalyst/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table'
import { EmptyState, FormBanner } from '@/components/form-banner'
import {
  createExpenseCategory,
  deleteExpenseCategory,
  updateExpenseCategory,
} from '@/lib/actions/expenses'
import type { FormState } from '@/lib/actions/expenses'
import type { ExpenseCategoryListItem } from '@/lib/queries/accounting'

type Editing = ExpenseCategoryListItem | null

export function CategoriesManager({
  categories,
  canManage,
}: {
  categories: ExpenseCategoryListItem[]
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteExpenseCategory(id)

      if (result.ok) {
        setError(null)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {error ? <FormBanner tone="error">{error}</FormBanner> : null}

      {canManage ? (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            Add category
          </Button>
        </div>
      ) : null}

      {categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Group expenses as rent, salary, raw material, transport and so on."
        />
      ) : (
        <Table dense grid striped>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader className="text-right">Order</TableHeader>
              <TableHeader className="text-right">Expenses</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="w-24" />
            </TableRow>
          </TableHead>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {category.sortOrder}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {category._count.expenses}
                </TableCell>
                <TableCell>
                  <Badge color={category.isActive ? 'lime' : 'zinc'}>
                    {category.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        plain
                        aria-label={`Edit ${category.name}`}
                        onClick={() => {
                          setEditing(category)
                          setOpen(true)
                        }}
                      >
                        <PencilSquareIcon />
                      </Button>
                      <Button
                        plain
                        aria-label={`Delete ${category.name}`}
                        disabled={pending}
                        onClick={() => remove(category.id)}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CategoryDialog
        key={editing?.id ?? 'new'}
        open={open}
        editing={editing}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

function CategoryDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean
  editing: Editing
  onClose: () => void
}) {
  const router = useRouter()
  const action = editing
    ? updateExpenseCategory.bind(null, editing.id)
    : createExpenseCategory

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData)

      if (result.status === 'success') {
        router.refresh()
        onClose()
      }

      return result
    },
    { status: 'idle' },
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | number | null | undefined) =>
    submitted[name] ??
    (fallback === null || fallback === undefined ? '' : String(fallback))

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{editing ? 'Edit category' : 'Add category'}</DialogTitle>
      <form action={formAction}>
        <DialogBody>
          <FieldGroup>
            {state.status === 'error' ? (
              <FormBanner tone="error">{state.message}</FormBanner>
            ) : null}
            <Field>
              <Label>Name</Label>
              <Input
                name="name"
                defaultValue={keep('name', editing?.name)}
                autoFocus
                required
                invalid={Boolean(errors.name)}
              />
              {errors.name ? <ErrorMessage>{errors.name}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>Sort order</Label>
              <Input
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={keep('sortOrder', editing?.sortOrder ?? 0)}
              />
              <Description>Lower numbers appear first.</Description>
            </Field>
            <SwitchField>
              <Label>Active</Label>
              <Description>
                Inactive categories stay on past expenses but cannot be picked
                on new ones.
              </Description>
              <Switch
                name="isActive"
                defaultChecked={editing?.isActive ?? true}
                value="true"
              />
            </SwitchField>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
