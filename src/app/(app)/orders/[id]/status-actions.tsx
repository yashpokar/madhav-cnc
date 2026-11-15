'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { ConfirmButton } from '@/components/confirm-button'
import { FormBanner } from '@/components/form-banner'
import { setOrderStatus } from '@/lib/actions/orders'
import type { SimpleResult } from '@/lib/actions/orders'
import { ORDER_STATUS_LABELS } from '@/lib/labels'
import { OrderStatus } from '@/generated/prisma/enums'

const NEXT_ACTIONS: Record<
  OrderStatus,
  { status: OrderStatus; primary?: boolean }[]
> = {
  DRAFT: [{ status: 'CONFIRMED', primary: true }, { status: 'CANCELLED' }],
  CONFIRMED: [{ status: 'IN_PRODUCTION', primary: true }, { status: 'CANCELLED' }],
  IN_PRODUCTION: [{ status: 'READY', primary: true }, { status: 'CANCELLED' }],
  READY: [{ status: 'DISPATCHED', primary: true }, { status: 'IN_PRODUCTION' }],
  DISPATCHED: [{ status: 'COMPLETED', primary: true }, { status: 'READY' }],
  COMPLETED: [],
  CANCELLED: [],
}

export function OrderStatusActions({
  id,
  status,
  canUpdate,
  nextStep,
}: {
  id: string
  status: OrderStatus
  canUpdate: boolean
  /** A cross-page next step (e.g. create the challan); becomes the primary button. */
  nextStep?: { label: string; href: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)

  function move(next: OrderStatus) {
    startTransition(async () => {
      const outcome = await setOrderStatus(id, next)
      setResult(outcome)

      if (outcome.ok) {
        router.refresh()
      }
    })
  }

  if (!canUpdate && !nextStep) {
    return null
  }

  const actions = canUpdate ? NEXT_ACTIONS[status] : []

  return (
    <div className="grid grid-cols-1 gap-4">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      {actions.length > 0 || nextStep ? (
        <div className="flex flex-wrap gap-3">
          {nextStep ? <Button href={nextStep.href}>{nextStep.label}</Button> : null}
          {actions.map((action) =>
            action.primary && !nextStep ? (
              <Button
                key={action.status}
                disabled={pending}
                onClick={() => move(action.status)}
              >
                Move to {ORDER_STATUS_LABELS[action.status].toLowerCase()}
              </Button>
            ) : action.status === 'CANCELLED' ? (
              <ConfirmButton
                key={action.status}
                label="Cancel order"
                title="Cancel this order?"
                description="Production stops and the order is closed. Open production tasks stay on record but leave the board."
                confirmLabel="Cancel order"
                action={() => setOrderStatus(id, 'CANCELLED')}
              />
            ) : (
              <Button
                key={action.status}
                outline
                disabled={pending}
                onClick={() => move(action.status)}
              >
                {ORDER_STATUS_LABELS[action.status]}
              </Button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}
