'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TrashIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox'
import { FormBanner } from '@/components/form-banner'
import {
  deletePayment,
  duplicateInvoice,
  recordPayment,
  setInvoiceStatus,
  type SimpleResult,
} from '@/lib/actions/invoices'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import { InvoiceStatus, PaymentMode } from '@/generated/prisma/enums'

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

export function InvoiceActions({
  id,
  status,
  due,
  canUpdate,
  canTakePayment,
  canCreate,
}: {
  id: string
  status: InvoiceStatus
  due: number
  canUpdate: boolean
  canTakePayment: boolean
  canCreate: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [amount, setAmount] = useState(String(due > 0 ? due : ''))
  const [mode, setMode] = useState<PaymentMode>('UPI')
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))

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

  return (
    <div className="grid grid-cols-1 gap-4">
      {result ? (
        <FormBanner tone={result.ok ? 'success' : 'error'}>
          {result.ok ? result.message : result.error}
        </FormBanner>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {canUpdate && status === 'DRAFT' ? (
          <>
            <Button
              disabled={pending}
              onClick={() => run(() => setInvoiceStatus(id, 'ISSUED'))}
            >
              Issue invoice
            </Button>
            <Button
              outline
              disabled={pending}
              onClick={() => run(() => setInvoiceStatus(id, 'CANCELLED'))}
            >
              Cancel
            </Button>
          </>
        ) : null}

        {canTakePayment && status === 'ISSUED' && due > 0 ? (
          <Button disabled={pending} onClick={() => setPayOpen(true)}>
            Record payment
          </Button>
        ) : null}

        {canUpdate && status === 'ISSUED' ? (
          <Button
            outline
            disabled={pending}
            onClick={() => run(() => setInvoiceStatus(id, 'DRAFT'))}
          >
            Back to draft
          </Button>
        ) : null}

        {canCreate ? (
          <Button
            outline
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const outcome = await duplicateInvoice(id)
                setResult(outcome)

                if (outcome.ok && outcome.id) {
                  router.push(`/invoices/${outcome.id}/edit`)
                }
              })
            }
          >
            Duplicate
          </Button>
        ) : null}
      </div>

      {payOpen ? (
        <div className="grid max-w-xl grid-cols-1 gap-4 rounded-lg bg-zinc-50 p-4 dark:bg-white/5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={due}
                value={amount}
                autoFocus
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field>
              <Label>Mode</Label>
              <Listbox value={mode} onChange={setMode}>
                {Object.values(PaymentMode).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{PAYMENT_MODE_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Paid on</Label>
              <Input
                type="date"
                value={paidOn}
                onChange={(event) => setPaidOn(event.target.value)}
              />
            </Field>
            <Field>
              <Label>Reference</Label>
              <Input
                value={reference}
                placeholder="UTR, cheque no."
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={pending || Number(amount) <= 0}
              onClick={() =>
                run(
                  () =>
                    recordPayment(id, {
                      amount,
                      mode,
                      reference: reference.trim() || undefined,
                      paidOn,
                    }),
                  () => {
                    setPayOpen(false)
                    setReference('')
                  },
                )
              }
            >
              Save payment
            </Button>
            <Button plain onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
          </div>
          <div className="text-sm/6 text-zinc-500 dark:text-zinc-400">
            {currency.format(due)} outstanding
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function RemovePaymentButton({
  paymentId,
  canDelete,
}: {
  paymentId: string
  canDelete: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (!canDelete) {
    return null
  }

  return (
    <Button
      plain
      aria-label="Remove payment"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deletePayment(paymentId)
          router.refresh()
        })
      }
    >
      <TrashIcon />
    </Button>
  )
}
