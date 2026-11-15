'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { DatePicker } from '@/components/catalyst/date-picker'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog'
import { ErrorMessage, Field, FieldGroup, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { Textarea } from '@/components/catalyst/textarea'
import { createAdjustment, updateAdjustment } from '@/lib/actions/adjustments'
import { directionOf, previewBalance, signedAmount, type Direction } from '@/lib/adjustments-math'
import { ADJUSTMENT_REASON_LABELS } from '@/lib/labels'
import { notify } from '@/lib/toast'

export type AdjustTarget = {
  kind: 'CHANNEL' | 'CUSTOMER'
  id: string
  name: string
  /** The balance now (payment mode closing, or what the customer owes). */
  current?: number
}

export type ExistingAdjustment = {
  id: string
  /** Signed, as stored. */
  amount: number
  adjustedOn: string
  reason: keyof typeof ADJUSTMENT_REASON_LABELS
  note: string
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const money = (value: number) =>
  value < 0 ? `−${inr.format(Math.abs(value))}` : inr.format(value)

const today = () => {
  const now = new Date()

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const WORDS = {
  CHANNEL: {
    up: 'Add money',
    down: 'Remove money',
    subject: 'balance',
    help: 'Use this when an entry was forgotten or the real balance differs from the books. It is recorded as a dated entry, so it can be traced and undone.',
  },
  CUSTOMER: {
    up: 'Customer owes more',
    down: 'Customer owes less',
    subject: 'dues',
    help: 'Use this to fix what a customer owes without editing past documents. It is recorded as a dated entry, so it can be traced and undone.',
  },
} as const

/**
 * The "Adjust balance" dialog: a direction, a positive amount, a date, a
 * reason and a required note. The sign is derived from the direction. Pass
 * `existing` to correct an entry instead of adding one.
 */
export function AdjustBalanceDialog({
  open,
  onClose,
  target,
  existing,
}: {
  open: boolean
  onClose: () => void
  target: AdjustTarget
  existing?: ExistingAdjustment
}) {
  return (
    <Dialog open={open} onClose={onClose} size="lg">
      {open ? <Form target={target} existing={existing} onClose={onClose} /> : null}
    </Dialog>
  )
}

function Form({
  target,
  existing,
  onClose,
}: {
  target: AdjustTarget
  existing?: ExistingAdjustment
  onClose: () => void
}) {
  const router = useRouter()
  const words = WORDS[target.kind]
  const [direction, setDirection] = useState<Direction>(existing ? directionOf(existing.amount) : 'up')
  const [amount, setAmount] = useState(existing ? String(Math.abs(existing.amount)) : '')
  const [adjustedOn, setAdjustedOn] = useState(existing?.adjustedOn ?? today())
  const [reason, setReason] = useState<string>(existing?.reason ?? 'FORGOTTEN_ENTRY')
  const [note, setNote] = useState(existing?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const entered = Number(amount)
  const valid = Number.isFinite(entered) && entered > 0
  const change = valid ? signedAmount(direction, entered) : 0
  // When correcting an entry, start from the balance without its old effect.
  const base = target.current === undefined ? undefined : target.current - (existing?.amount ?? 0)
  const next = base === undefined ? undefined : previewBalance(base, change)

  function submit() {
    setError(null)

    const input = {
      kind: target.kind,
      targetId: target.id,
      direction,
      amount,
      adjustedOn,
      reason,
      note,
    } as const

    startTransition(async () => {
      const result = existing
        ? await updateAdjustment(existing.id, input as Parameters<typeof updateAdjustment>[1])
        : await createAdjustment(input as Parameters<typeof createAdjustment>[0])

      if (!result.ok) {
        setError(result.error)
        return
      }

      notify.success(result.message)
      onClose()
      router.refresh()
    })
  }

  return (
    <>
      <DialogTitle>
        {existing ? 'Edit adjustment' : 'Adjust balance'}: {target.name}
      </DialogTitle>
      <DialogDescription>{words.help}</DialogDescription>
      <DialogBody>
        <FieldGroup>
          <Field>
            <Label>What changed</Label>
            <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label="Direction">
              {(['up', 'down'] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  {...(direction === value ? { color: 'dark/zinc' as const } : { outline: true as const })}
                  aria-pressed={direction === value}
                  onClick={() => setDirection(value)}
                >
                  {words[value]}
                </Button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                autoFocus
              />
            </Field>
            <Field>
              <Label>Date</Label>
              <DatePicker value={adjustedOn} onChange={(event) => setAdjustedOn(event.target.value)} required />
            </Field>
          </div>

          {next !== undefined && base !== undefined && valid ? (
            <p
              role="status"
              className="rounded-lg bg-zinc-50 px-3 py-2 text-sm/6 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
            >
              {target.name} {words.subject} will change from{' '}
              <span className="font-medium tabular-nums">{money(base)}</span> to{' '}
              <span className="font-semibold tabular-nums">{money(next)}</span>
            </p>
          ) : null}

          <Field>
            <Label>Reason</Label>
            <Select value={reason} onChange={(event) => setReason(event.target.value)}>
              {Object.entries(ADJUSTMENT_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>What happened</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example: rent paid in cash on 3 Nov was not entered"
            />
          </Field>

          {error ? <ErrorMessage role="alert">{error}</ErrorMessage> : null}
        </FieldGroup>
      </DialogBody>
      <DialogActions>
        <Button type="button" plain onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Record adjustment'}
        </Button>
      </DialogActions>
    </>
  )
}

/** A button that opens the dialog for one payment mode or customer. */
export function AdjustBalanceButton({
  target,
  label = 'Adjust balance',
  existing,
  plain = true,
}: {
  target: AdjustTarget
  label?: string
  existing?: ExistingAdjustment
  plain?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        {...(plain ? { plain: true as const } : { outline: true as const })}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <AdjustBalanceDialog
        open={open}
        onClose={() => setOpen(false)}
        target={target}
        existing={existing}
      />
    </>
  )
}
