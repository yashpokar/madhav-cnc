'use client'

import { useState } from 'react'
import { ArrowUturnLeftIcon, PencilSquareIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import {
  AdjustBalanceDialog,
  type AdjustTarget,
  type ExistingAdjustment,
} from '@/components/adjust-balance-dialog'
import { HistoryDrawer } from '@/components/audit/history-drawer'
import { ConfirmButton } from '@/components/confirm-button'
import { RowActions } from '@/components/row-actions'
import { deleteAdjustment, reverseAdjustment } from '@/lib/actions/adjustments'

/**
 * History, edit, reverse and delete for one adjustment row. A reversal pair
 * (the original and its counter entry) can no longer be edited, reversed
 * again or deleted by itself: `reversal` says which side this row is.
 */
export function AdjustmentRowActions({
  number,
  target,
  existing,
  reversal = null,
}: {
  number: string
  target: AdjustTarget
  existing: ExistingAdjustment
  reversal?: 'of' | 'by' | null
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="relative z-10 flex items-center justify-end gap-1">
      <HistoryDrawer model="BalanceAdjustment" id={existing.id} plain label="" title={`History of ${number}`} />
      {reversal ? null : (
        <>
          <Button plain aria-label={`Edit ${number}`} onClick={() => setEditing(true)}>
            <PencilSquareIcon />
          </Button>
          <ConfirmButton
            outline={false}
            tone="neutral"
            label={`Reverse ${number}`}
            title={`Reverse ${number}?`}
            description="This adds a new entry dated today that cancels this one out. Both stay on the books, linked, so the correction is visible. Use this instead of editing an entry in a closed period."
            confirmLabel="Reverse"
            askReason
            action={(reason) => reverseAdjustment(existing.id, reason)}
          >
            <ArrowUturnLeftIcon />
            <span className="sr-only">Reverse {number}</span>
          </ConfirmButton>
        </>
      )}
      <RowActions
        name={number}
        askReason
        deleteAction={reversal === 'by' ? undefined : deleteAdjustment.bind(null, existing.id)}
        deleteTitle={`Delete ${number}?`}
        deleteDescription="This removes the adjustment and puts the balance back exactly as it was before it. A full copy of it is kept in the audit trail. Prefer Reverse when the entry should stay visible."
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
