'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TrashIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { ConfirmButton, DANGER_TRIGGER } from '@/components/confirm-button'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox'
import { FormBanner } from '@/components/form-banner'
import {
  removeAllocation,
  duplicateInvoice,
  recordPayment,
  removeWriteOff,
  setInvoiceStatus,
  writeOffInvoice,
  type SimpleResult,
} from '@/lib/actions/invoices'
import { PAYMENT_MODE_LABELS, WRITE_OFF_REASON_LABELS } from '@/lib/labels'
import { whatsappLink } from '@/lib/whatsapp'
import { InvoiceStatus, PaymentMode, WriteOffReason } from '@/generated/prisma/enums'

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
  canWriteOff,
  canCreate,
  contact,
}: {
  id: string
  contact: { name: string; phone: string | null; number: string }
  status: InvoiceStatus
  due: number
  canUpdate: boolean
  canTakePayment: boolean
  canWriteOff: boolean
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
  const [offOpen, setOffOpen] = useState(false)
  const [offAmount, setOffAmount] = useState(String(due > 0 ? due : ''))
  const [offReason, setOffReason] = useState<WriteOffReason>('CUSTOMER_UNREACHABLE')
  const [offNotes, setOffNotes] = useState('')
  const [offOn, setOffOn] = useState(new Date().toISOString().slice(0, 10))

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
            <ConfirmButton
              outline={false}
              tone="neutral"
              label="Issue invoice"
              title="Issue this invoice?"
              description="It will count towards the customer's balance and can no longer be edited unless you move it back to draft."
              confirmLabel="Issue"
              action={() => setInvoiceStatus(id, 'ISSUED')}
            >
              Issue invoice
            </ConfirmButton>
            <ConfirmButton
              label="Cancel invoice"
              title="Cancel this invoice?"
              description="The invoice stays on record as cancelled and stops counting towards the customer's balance."
              confirmLabel="Cancel invoice"
              action={() => setInvoiceStatus(id, 'CANCELLED')}
            />
          </>
        ) : null}

        {canTakePayment && status === 'ISSUED' && due > 0 ? (
          <Button disabled={pending} onClick={() => setPayOpen(true)}>
            Record payment
          </Button>
        ) : null}

        {canWriteOff && status === 'ISSUED' && due > 0 ? (
          <Button
            outline
            className={DANGER_TRIGGER}
            disabled={pending}
            onClick={() => setOffOpen(true)}
          >
            Mark not recoverable
          </Button>
        ) : null}

        {status === 'ISSUED' && due > 0 ? (
          <Button
            outline
            href={whatsappLink(
              contact.phone,
              `Hello ${contact.name}, a gentle reminder from Madhav CNC: invoice ${contact.number} has ${currency.format(due)} outstanding. Kindly arrange the payment. Thank you!`,
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            Remind on WhatsApp
          </Button>
        ) : null}

        {canUpdate && status === 'ISSUED' ? (
          <ConfirmButton
            tone="neutral"
            label="Back to draft"
            title="Move this invoice back to draft?"
            description="It will leave the customer's balance until it is issued again. Payments already applied stay linked."
            action={() => setInvoiceStatus(id, 'DRAFT')}
          />
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

      {offOpen ? (
        <div className="grid max-w-xl grid-cols-1 gap-4 rounded-lg bg-zinc-50 p-4 dark:bg-white/5">
          <div className="text-sm/6 text-zinc-500 dark:text-zinc-400">
            Use this when money on this invoice will not be collected. It stops
            counting as owed, but stays on record with the reason, so you can
            see the customer&apos;s history later.
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Amount not recoverable</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={due}
                value={offAmount}
                autoFocus
                onChange={(event) => setOffAmount(event.target.value)}
              />
            </Field>
            <Field>
              <Label>Reason</Label>
              <Listbox value={offReason} onChange={setOffReason}>
                {Object.values(WriteOffReason).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{WRITE_OFF_REASON_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Date</Label>
              <Input
                type="date"
                value={offOn}
                onChange={(event) => setOffOn(event.target.value)}
              />
            </Field>
            <Field>
              <Label>Note{offReason === 'OTHER' ? '' : ' (optional)'}</Label>
              <Input
                value={offNotes}
                placeholder="What happened, who you spoke to"
                onChange={(event) => setOffNotes(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={pending || Number(offAmount) <= 0}
              onClick={() =>
                run(
                  () =>
                    writeOffInvoice(id, {
                      amount: offAmount,
                      reason: offReason,
                      notes: offNotes.trim() || undefined,
                      writtenOffOn: offOn,
                    }),
                  () => {
                    setOffOpen(false)
                    setOffNotes('')
                  },
                )
              }
            >
              Mark not recoverable
            </Button>
            <Button plain onClick={() => setOffOpen(false)}>
              Cancel
            </Button>
          </div>
          <div className="text-sm/6 text-zinc-500 dark:text-zinc-400">
            {currency.format(due)} outstanding
          </div>
        </div>
      ) : null}

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
  allocationId,
  canDelete,
}: {
  allocationId: string
  canDelete: boolean
}) {
  if (!canDelete) {
    return null
  }

  return (
    <ConfirmButton
      outline={false}
      label="Unapply payment"
      title="Unapply this payment?"
      description="The amount goes back to the customer's unapplied balance and this invoice's due amount increases."
      confirmLabel="Unapply"
      action={() => removeAllocation(allocationId)}
    >
      <TrashIcon className="size-4" aria-hidden="true" />
      <span className="sr-only">Unapply payment</span>
    </ConfirmButton>
  )
}

export function RemoveWriteOffButton({
  writeOffId,
  canUpdate,
}: {
  writeOffId: string
  canUpdate: boolean
}) {
  if (!canUpdate) {
    return null
  }

  return (
    <ConfirmButton
      outline={false}
      label="Reverse write-off"
      title="Reverse this write-off?"
      description="The amount will count as outstanding on this invoice and the customer's balance again."
      confirmLabel="Reverse"
      action={() => removeWriteOff(writeOffId)}
    >
      <TrashIcon className="size-4" aria-hidden="true" />
      <span className="sr-only">Reverse write-off</span>
    </ConfirmButton>
  )
}
