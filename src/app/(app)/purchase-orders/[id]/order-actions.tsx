'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { ConfirmButton } from '@/components/confirm-button'
import { FormBanner } from '@/components/form-banner'
import { PrintButton } from '@/components/print-button'
import {
  createBillFromOrder,
  setOrderStatus,
  type SimpleResult,
} from '@/lib/actions/purchase-orders'
import { whatsappLink } from '@/lib/whatsapp'
import type { PurchaseOrderStatus } from '@/generated/prisma/enums'

export function OrderActions({
  id,
  status,
  vendorPhone,
  message,
  canUpdate,
  canCreate,
}: {
  id: string
  status: PurchaseOrderStatus
  vendorPhone: string | null
  /** The plain-text summary sent over WhatsApp. */
  message: string
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

  const open = status !== 'CANCELLED'

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
          <Button type="button" disabled={pending} onClick={() => run(() => setOrderStatus(id, 'SENT'))}>
            Mark as sent
          </Button>
        ) : null}

        {canUpdate && status === 'SENT' ? (
          <Button
            type="button"
            outline
            disabled={pending}
            onClick={() => run(() => setOrderStatus(id, 'DRAFT'))}
          >
            Back to draft
          </Button>
        ) : null}

        {open ? (
          <Button outline href={whatsappLink(vendorPhone, message)} target="_blank" rel="noreferrer">
            <ChatBubbleLeftRightIcon />
            Send on WhatsApp
          </Button>
        ) : null}

        <PrintButton label="Print order" />

        {canCreate && open ? (
          <Button
            type="button"
            outline
            disabled={pending}
            onClick={() =>
              run(
                () => createBillFromOrder(id),
                (outcome) => {
                  if (outcome.ok && outcome.id) router.push(`/purchase-bills/${outcome.id}`)
                },
              )
            }
          >
            Create bill from this order
          </Button>
        ) : null}

        {canUpdate && (status === 'DRAFT' || status === 'SENT') ? (
          <ConfirmButton
            label="Cancel order"
            title="Cancel this purchase order?"
            description="The order stays on record as cancelled and can no longer be billed or edited."
            confirmLabel="Cancel order"
            action={() => setOrderStatus(id, 'CANCELLED')}
          />
        ) : null}
      </div>

      {open && !vendorPhone ? (
        <p className="text-xs/5 text-zinc-500 dark:text-zinc-400">
          This vendor has no phone number saved, so WhatsApp will open without a recipient.
        </p>
      ) : null}
    </div>
  )
}
