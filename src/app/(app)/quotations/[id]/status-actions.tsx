'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { FormBanner } from '@/components/form-banner'
import { createRevision, setQuotationStatus } from '@/lib/actions/quotations'
import { convertQuotationToOrder } from '@/lib/actions/orders'
import type { SimpleResult } from '@/lib/actions/quotations'
import { QuotationStatus } from '@/generated/prisma/enums'

const NEXT_ACTIONS: Record<
  QuotationStatus,
  { status: QuotationStatus; label: string; tone?: 'primary' | 'plain' }[]
> = {
  DRAFT: [{ status: 'SENT', label: 'Mark as sent', tone: 'primary' }],
  SENT: [
    { status: 'ACCEPTED', label: 'Mark accepted', tone: 'primary' },
    { status: 'REJECTED', label: 'Mark rejected' },
    { status: 'EXPIRED', label: 'Mark expired' },
  ],
  ACCEPTED: [],
  REJECTED: [{ status: 'SENT', label: 'Re-open as sent' }],
  EXPIRED: [{ status: 'SENT', label: 'Re-open as sent' }],
  CONVERTED: [],
}

export function StatusActions({
  id,
  status,
  canUpdate,
  canCreate,
  canCreateOrder,
}: {
  id: string
  status: QuotationStatus
  canUpdate: boolean
  canCreate: boolean
  canCreateOrder: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)

  function run(action: () => Promise<SimpleResult>, navigateTo?: (id: string) => string) {
    startTransition(async () => {
      const outcome = await action()
      setResult(outcome)

      if (outcome.ok) {
        if (navigateTo && outcome.id) {
          router.push(navigateTo(outcome.id))
          return
        }

        router.refresh()
      }
    })
  }

  const actions = NEXT_ACTIONS[status]

  return (
    <div className="grid grid-cols-1 gap-4">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {canUpdate &&
          actions.map((action) =>
            action.tone === 'primary' ? (
              <Button
                key={action.status}
                disabled={pending}
                onClick={() => run(() => setQuotationStatus(id, action.status))}
              >
                {action.label}
              </Button>
            ) : (
              <Button
                key={action.status}
                outline
                disabled={pending}
                onClick={() => run(() => setQuotationStatus(id, action.status))}
              >
                {action.label}
              </Button>
            ),
          )}

        {canCreateOrder && status === 'ACCEPTED' ? (
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => convertQuotationToOrder(id),
                (orderId) => `/orders/${orderId}`,
              )
            }
          >
            Convert to order
          </Button>
        ) : null}

        {canCreate && status !== 'DRAFT' ? (
          <Button
            outline
            disabled={pending}
            onClick={() =>
              run(() => createRevision(id), (newId) => `/quotations/${newId}/edit`)
            }
          >
            Create revision
          </Button>
        ) : null}
      </div>
    </div>
  )
}
