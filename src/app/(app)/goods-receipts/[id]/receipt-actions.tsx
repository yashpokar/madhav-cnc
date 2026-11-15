'use client'

import { ConfirmButton } from '@/components/confirm-button'
import { cancelReceiptAction } from '@/lib/actions/goods-receipts'

export function ReceiptActions({
  id,
  number,
  canOverride,
}: {
  id: string
  number: string
  /** Administrators may cancel even if stock would go below zero. */
  canOverride: boolean
}) {
  return (
    <>
      <ConfirmButton
        label="Cancel receipt"
        title={`Cancel ${number}?`}
        description="The stock this receipt added is taken off again, and the quantities come off the purchase order. It cannot be reopened; receive the goods again if needed. If the goods were already used, this is refused."
        confirmLabel="Cancel receipt"
        action={() => cancelReceiptAction(id, false)}
      />
      {canOverride ? (
        <ConfirmButton
          label="Cancel, allow negative stock"
          title={`Cancel ${number} even if stock goes below zero?`}
          description="Use this only when the goods were used or sold before the receipt was entered. Stock for those items will show a negative balance until it is corrected."
          confirmLabel="Cancel anyway"
          outline={false}
          action={() => cancelReceiptAction(id, true)}
        />
      ) : null}
    </>
  )
}
