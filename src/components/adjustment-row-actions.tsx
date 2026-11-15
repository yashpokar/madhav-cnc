'use client'

import { useState } from 'react'
import { PencilSquareIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import {
  AdjustBalanceDialog,
  type AdjustTarget,
  type ExistingAdjustment,
} from '@/components/adjust-balance-dialog'
import { RowActions } from '@/components/row-actions'
import { deleteAdjustment } from '@/lib/actions/adjustments'

/** Edit (opens the dialog) and delete (asks first) for one adjustment row. */
export function AdjustmentRowActions({
  number,
  target,
  existing,
}: {
  number: string
  target: AdjustTarget
  existing: ExistingAdjustment
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="relative z-10 flex items-center justify-end gap-1">
      <Button plain aria-label={`Edit ${number}`} onClick={() => setEditing(true)}>
        <PencilSquareIcon />
      </Button>
      <RowActions
        name={number}
        deleteAction={deleteAdjustment.bind(null, existing.id)}
        deleteTitle={`Delete ${number}?`}
        deleteDescription="This removes the adjustment and puts the balance back exactly as it was before it. This cannot be undone."
      />
      <AdjustBalanceDialog
        open={editing}
        onClose={() => setEditing(false)}
        target={target}
        existing={existing}
      />
    </div>
  )
}
