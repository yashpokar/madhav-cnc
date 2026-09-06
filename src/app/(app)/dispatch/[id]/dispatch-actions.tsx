'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { FormBanner } from '@/components/form-banner'
import {
  recordReceipt,
  setDispatchStatus,
  type SimpleResult,
} from '@/lib/actions/dispatches'
import { DispatchStatus } from '@/generated/prisma/enums'

export function DispatchActions({
  id,
  status,
  canUpdate,
}: {
  id: string
  status: DispatchStatus
  canUpdate: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receivedBy, setReceivedBy] = useState('')

  function run(action: () => Promise<SimpleResult>, after?: () => void) {
    startTransition(async () => {
      const outcome = await action()
      setResult(outcome)

      if (outcome.ok) {
        after?.()
        router.refresh()
      }
    })
  }

  if (!canUpdate) {
    return null
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {status === 'DRAFT' ? (
          <>
            <Button
              disabled={pending}
              onClick={() => run(() => setDispatchStatus(id, 'DISPATCHED'))}
            >
              Mark dispatched
            </Button>
            <Button
              outline
              disabled={pending}
              onClick={() => run(() => setDispatchStatus(id, 'CANCELLED'))}
            >
              Cancel challan
            </Button>
          </>
        ) : null}

        {status === 'DISPATCHED' ? (
          <>
            <Button disabled={pending} onClick={() => setReceiptOpen(true)}>
              Record delivery
            </Button>
            <Button
              outline
              disabled={pending}
              onClick={() => run(() => setDispatchStatus(id, 'DRAFT'))}
            >
              Back to draft
            </Button>
          </>
        ) : null}

        {status === 'DELIVERED' ? (
          <Button
            outline
            disabled={pending}
            onClick={() => run(() => setDispatchStatus(id, 'DISPATCHED'))}
          >
            Reopen
          </Button>
        ) : null}
      </div>

      {receiptOpen ? (
        <div className="grid max-w-sm grid-cols-1 gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-white/5">
          <Field>
            <Label>Received by</Label>
            <Input
              value={receivedBy}
              placeholder="Name of the person who received it"
              autoFocus
              onChange={(event) => setReceivedBy(event.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              disabled={pending || receivedBy.trim() === ''}
              onClick={() =>
                run(
                  () => recordReceipt(id, receivedBy),
                  () => setReceiptOpen(false),
                )
              }
            >
              Save receipt
            </Button>
            <Button plain onClick={() => setReceiptOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
