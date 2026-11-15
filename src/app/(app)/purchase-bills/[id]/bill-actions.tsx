'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { ConfirmButton } from '@/components/confirm-button'
import { FormBanner } from '@/components/form-banner'
import {
  duplicateBill,
  setBillStatus,
  type SimpleResult,
} from '@/lib/actions/purchase-bills'
import type { PurchaseBillStatus } from '@/generated/prisma/enums'

export function BillActions({
  id,
  status,
  hasPayments,
  canUpdate,
  canCreate,
}: {
  id: string
  status: PurchaseBillStatus
  hasPayments: boolean
  canUpdate: boolean
  canCreate: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)

  function run(task: () => Promise<SimpleResult>, then?: (result: SimpleResult) => void) {
    startTransition(async () => {
      const outcome = await task()

      setResult(outcome)

      if (outcome.ok) {
        then?.(outcome)
        router.refresh()
      }
    })
  }

  if (!canUpdate && !canCreate) return null

  return (
    <div className="grid grid-cols-1 gap-3 print:hidden">
      {result ? (
        <div role="status">
          <FormBanner tone={result.ok ? 'success' : 'error'}>
            {result.ok ? result.message : result.error}
          </FormBanner>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canUpdate && status === 'DRAFT' ? (
          <Button type="button" disabled={pending} onClick={() => run(() => setBillStatus(id, 'POSTED'))}>
            {pending ? 'Working…' : 'Post bill'}
          </Button>
        ) : null}

        {canUpdate && status === 'POSTED' ? (
          <Button
            type="button"
            outline
            disabled={pending || hasPayments}
            title={hasPayments ? 'Payments are applied to this bill' : undefined}
            onClick={() => run(() => setBillStatus(id, 'DRAFT'))}
          >
            Back to draft
          </Button>
        ) : null}

        {canUpdate && status !== 'CANCELLED' ? (
          <ConfirmButton
            label="Cancel bill"
            title="Cancel this bill?"
            description="A cancelled bill no longer counts towards what you owe the vendor. It cannot be reopened; duplicate it to record a corrected one."
            confirmLabel="Cancel bill"
            blocked={
              hasPayments
                ? 'Payments are applied to this bill. Remove them before cancelling it.'
                : null
            }
            action={() => setBillStatus(id, 'CANCELLED')}
          />
        ) : null}

        {canCreate ? (
          <Button
            type="button"
            outline
            disabled={pending}
            onClick={() =>
              run(
                () => duplicateBill(id),
                (outcome) => {
                  if (outcome.ok && outcome.id) router.push(`/purchase-bills/${outcome.id}/edit`)
                },
              )
            }
          >
            Duplicate
          </Button>
        ) : null}

        {/* Vendor payments arrive in a later release. Recording a payment against this
            bill (and the allocation behind "Payments applied") will be added here. */}
        {status === 'POSTED' ? (
          <Button type="button" outline disabled title="Recording vendor payments is coming soon">
            Record payment (coming soon)
          </Button>
        ) : null}
      </div>
    </div>
  )
}
