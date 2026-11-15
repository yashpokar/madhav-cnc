'use client'

import { PaymentModeSelect } from '@/components/payment-mode-select'
import type { PaymentModeOption } from '@/lib/queries/payment-modes'
import { money as currency } from '@/lib/format'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardIcon, TrashIcon } from '@heroicons/react/16/solid'
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
import {
  ensureInvoiceShareLink,
  regenerateInvoiceShareLink,
} from '@/lib/actions/invoice-share'
import { WRITE_OFF_REASON_LABELS } from '@/lib/labels'
import { whatsappLink } from '@/lib/whatsapp'
import { isWhatsAppSafeToken } from '@/lib/share-token'
import { InvoiceStatus, WriteOffReason } from '@/generated/prisma/enums'

export function InvoiceActions({
  id,
  status,
  due,
  total,
  canUpdate,
  canTakePayment,
  canWriteOff,
  canCreate,
  contact,
  modes,
  shareToken,
  baseUrl,
}: {
  id: string
  contact: { name: string; phone: string | null; number: string }
  status: InvoiceStatus
  due: number
  /** The full invoice amount, so the balance can be read against it. */
  total: number
  canUpdate: boolean
  canTakePayment: boolean
  canWriteOff: boolean
  canCreate: boolean
  modes: PaymentModeOption[]
  /** The customer link's token, once one has been made. */
  shareToken: string | null
  baseUrl: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SimpleResult | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [amount, setAmount] = useState(String(due > 0 ? due : ''))
  const [channelId, setChannelId] = useState(modes[0]?.id ?? '')
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [offOpen, setOffOpen] = useState(false)
  const [offAmount, setOffAmount] = useState(String(due > 0 ? due : ''))
  const [offReason, setOffReason] = useState<WriteOffReason>('CUSTOMER_UNREACHABLE')
  const [offNotes, setOffNotes] = useState('')
  const [offOn, setOffOn] = useState(new Date().toISOString().slice(0, 10))
  const [token, setToken] = useState(shareToken)
  const [copied, setCopied] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherPhone, setOtherPhone] = useState('')

  function linkFor(value: string) {
    const origin = baseUrl ?? window.location.origin

    return `${origin.replace(/\/$/, '')}/i/${value}`
  }

  function shareMessage(url: string) {
    const amount =
      due > 0
        ? `The amount due is ${currency.format(due)}`
        : `The total is ${currency.format(total)} (paid in full)`

    return `Hello ${contact.name}, thank you for your business! Here is your invoice ${contact.number} from Madhav CNC. ${amount}. You can view it, see how to pay and download a PDF here:\n\n${url}`
  }

  /** The customer link, made on first use. */
  async function ensureLink(): Promise<string | null> {
    if (token) {
      return token
    }

    const outcome = await ensureInvoiceShareLink(id)

    if (!outcome.ok || !outcome.id) {
      setResult(outcome.ok ? { ok: false, error: 'Could not create the link' } : outcome)
      return null
    }

    setToken(outcome.id)
    router.refresh()

    return outcome.id
  }

  function sendOnWhatsApp(phone: string | null) {
    // Open the tab now: browsers block a window opened after a server round trip.
    const tab = window.open('', '_blank')

    startTransition(async () => {
      const value = await ensureLink()

      if (!value) {
        tab?.close()
        return
      }

      const target = whatsappLink(phone, shareMessage(linkFor(value)))

      if (tab) {
        tab.location.href = target
      } else {
        window.location.href = target
      }

      setResult({ ok: true, message: 'WhatsApp opened. Press send there to share the invoice.' })
    })
  }

  function copyLink() {
    startTransition(async () => {
      const value = await ensureLink()

      if (!value) {
        return
      }

      try {
        await navigator.clipboard.writeText(linkFor(value))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        setResult({ ok: true, message: 'Link copied' })
      } catch {
        setResult({ ok: false, error: `Could not copy. The link is ${linkFor(value)}` })
      }
    })
  }

  const canShare = status === 'ISSUED' && (canUpdate || Boolean(token))
  const otherDigits = otherPhone.replace(/\D/g, '')

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
          <Button
            disabled={pending}
            onClick={() => {
              // Always start from what is actually due now, not a stale or earlier value.
              setAmount(due > 0 ? String(due) : '')
              setPayOpen(true)
            }}
          >
            Record payment
          </Button>
        ) : null}

        {canWriteOff && status === 'ISSUED' && due > 0 ? (
          <Button
            outline
            className={DANGER_TRIGGER}
            disabled={pending}
            onClick={() => {
              setOffAmount(due > 0 ? String(due) : '')
              setOffOpen(true)
            }}
          >
            Mark not recoverable
          </Button>
        ) : null}

        {canShare ? (
          <Button
            disabled={pending}
            onClick={() => sendOnWhatsApp(contact.phone)}
          >
            Send on WhatsApp
          </Button>
        ) : null}

        {canShare ? (
          <Button outline disabled={pending} onClick={copyLink}>
            <ClipboardIcon />
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        ) : null}

        {canShare ? (
          <Button outline disabled={pending} onClick={() => setOtherOpen((open) => !open)}>
            Send to another number
          </Button>
        ) : null}

        {canUpdate && status === 'ISSUED' && token && !isWhatsAppSafeToken(token) ? (
          <p className="basis-full rounded-lg bg-amber-50 px-3 py-2 text-sm/6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            This older link can break when sent on WhatsApp. Create a new link. Use Regenerate link.
          </p>
        ) : null}

        {canUpdate && status === 'ISSUED' && token ? (
          <ConfirmButton
            tone="neutral"
            label="Regenerate link"
            title="Regenerate the customer link?"
            description="A new link is created and the one already sent stops opening straight away. You will need to send the new link to the customer."
            confirmLabel="Regenerate"
            action={async () => {
              const outcome = await regenerateInvoiceShareLink(id)

              if (outcome.ok && outcome.id) {
                setToken(outcome.id)
              }

              return outcome
            }}
          />
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

      {canShare && otherOpen ? (
        <div className="grid max-w-xl grid-cols-1 gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-white/5">
          <Field>
            <Label>WhatsApp number</Label>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              autoFocus
              value={otherPhone}
              placeholder="98765 43210"
              onChange={(event) => setOtherPhone(event.target.value)}
            />
          </Field>
          <div className="text-sm/6 text-zinc-500 dark:text-zinc-400">
            A 10-digit number is treated as an Indian number. Use the country
            code for any other.
          </div>
          <div className="flex gap-2">
            <Button
              disabled={pending || otherDigits.length < 10}
              onClick={() => sendOnWhatsApp(otherPhone)}
            >
              Open WhatsApp
            </Button>
            <Button plain onClick={() => setOtherOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}

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
          <dl className="grid grid-cols-2 gap-3 text-sm/6">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Invoice amount</dt>
              <dd className="font-medium tabular-nums">{currency.format(total)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Remaining balance</dt>
              <dd className="font-semibold text-red-600 tabular-nums dark:text-red-400">
                {currency.format(due)}
              </dd>
            </div>
          </dl>
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
              <PaymentModeSelect modes={modes} value={channelId} onChange={setChannelId} />
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
                      channelId,
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
