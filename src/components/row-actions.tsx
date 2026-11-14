'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  EllipsisHorizontalIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown'
import { FormBanner } from '@/components/form-banner'

type DeleteResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string }

/**
 * The actions for a row in a list, in one "more" menu. It sits above the
 * row's full-width link, so opening it does not open the record. Leave a prop
 * out to hide that action, e.g. pass no `editHref` when the record can no
 * longer be edited. Delete asks first. With nothing to offer, nothing shows.
 */
export function RowActions({
  name,
  viewHref,
  editHref,
  items = [],
  deleteAction,
  deleteTitle,
  deleteDescription,
}: {
  /** What the row is, e.g. "QT-0042"; used for the menu label and dialog. */
  name: string
  viewHref?: string
  editHref?: string
  /** Extra links, shown between Edit and Delete. */
  items?: { label: string; href: string }[]
  deleteAction?: () => Promise<DeleteResult | { ok: boolean }>
  deleteTitle?: string
  deleteDescription?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!viewHref && !editHref && items.length === 0 && !deleteAction) {
    return null
  }

  function close() {
    if (!pending) {
      setOpen(false)
      setError(null)
    }
  }

  function confirm() {
    startTransition(async () => {
      const result = (await deleteAction?.()) as DeleteResult | undefined

      if (result && !result.ok) {
        setError(result.error)
        return
      }

      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="relative z-10 flex justify-end">
      <Dropdown>
        <DropdownButton plain aria-label={`Actions for ${name}`}>
          <EllipsisHorizontalIcon />
        </DropdownButton>
        <DropdownMenu anchor="bottom end">
          {viewHref ? (
            <DropdownItem href={viewHref}>
              <EyeIcon data-slot="icon" />
              <DropdownLabel>View</DropdownLabel>
            </DropdownItem>
          ) : null}
          {editHref ? (
            <DropdownItem href={editHref}>
              <PencilSquareIcon data-slot="icon" />
              <DropdownLabel>Edit</DropdownLabel>
            </DropdownItem>
          ) : null}
          {items.map((item) => (
            <DropdownItem key={item.href} href={item.href}>
              <DropdownLabel>{item.label}</DropdownLabel>
            </DropdownItem>
          ))}
          {deleteAction ? (
            <>
              {viewHref || editHref || items.length > 0 ? <DropdownDivider /> : null}
              <DropdownItem
                onClick={() => setOpen(true)}
                className="text-red-600! dark:text-red-400! data-focus:bg-red-600! data-focus:text-white! dark:data-focus:text-white!"
              >
                <TrashIcon data-slot="icon" />
                <DropdownLabel>Delete</DropdownLabel>
              </DropdownItem>
            </>
          ) : null}
        </DropdownMenu>
      </Dropdown>

      {deleteAction ? (
        <Dialog open={open} onClose={close} size="md" role="alertdialog">
          <DialogTitle>{deleteTitle ?? `Delete ${name}?`}</DialogTitle>
          <DialogDescription>
            {deleteDescription ??
              'This permanently removes the record. This cannot be undone.'}
          </DialogDescription>
          {error ? (
            <DialogBody>
              <div role="alert">
                <FormBanner tone="error">{error}</FormBanner>
              </div>
            </DialogBody>
          ) : null}
          <DialogActions>
            <Button type="button" plain onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" color="red" onClick={confirm} disabled={pending} autoFocus>
              {pending ? 'Working…' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </div>
  )
}
