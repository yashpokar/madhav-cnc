import { EyeIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { ConfirmButton } from '@/components/confirm-button'

type DeleteResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string }

/**
 * Quick actions for a row in a list. Sits above the row's full-width link, so
 * clicking a button does not open the record. Leave a prop out to hide that
 * action, e.g. pass no `editHref` when the record can no longer be edited.
 */
export function RowActions({
  name,
  viewHref,
  editHref,
  deleteAction,
  deleteTitle,
  deleteDescription,
}: {
  /** What the row is, e.g. "QT-0042"; used for tooltips and the dialog. */
  name: string
  viewHref?: string
  editHref?: string
  deleteAction?: () => Promise<DeleteResult | { ok: boolean }>
  deleteTitle?: string
  deleteDescription?: string
}) {
  return (
    <div className="relative z-10 flex items-center justify-end gap-0.5">
      {viewHref ? (
        <Button plain href={viewHref} title={`View ${name}`} aria-label={`View ${name}`}>
          <EyeIcon />
        </Button>
      ) : null}
      {editHref ? (
        <Button plain href={editHref} title={`Edit ${name}`} aria-label={`Edit ${name}`}>
          <PencilSquareIcon />
        </Button>
      ) : null}
      {deleteAction ? (
        <ConfirmButton
          outline={false}
          label={`Delete ${name}`}
          title={deleteTitle ?? `Delete ${name}?`}
          description={
            deleteDescription ??
            'This permanently removes the record. This cannot be undone.'
          }
          confirmLabel="Delete"
          action={deleteAction as () => Promise<DeleteResult>}
        >
          <TrashIcon />
          <span className="sr-only">Delete {name}</span>
        </ConfirmButton>
      ) : null}
    </div>
  )
}
