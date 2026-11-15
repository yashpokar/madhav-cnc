'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PaymentModeSelect } from '@/components/payment-mode-select'
import { PaymentMethodFields, detailsFromJson } from '@/components/payment-method-fields'
import type { PaymentModeOption } from '@/lib/queries/payment-modes'
import { money as currency } from '@/lib/format'
import { Button } from '@/components/catalyst/button'
import { Divider } from '@/components/catalyst/divider'
import {
  Description,
  ErrorMessage,
  Field,
  FieldGroup,
  Fieldset,
  Label,
  Legend,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { Textarea } from '@/components/catalyst/textarea'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { createVendorPayment, openBillsFor } from '@/lib/actions/vendor-payments'
import type { FormState } from '@/lib/actions/vendor-payments'
import type { OpenBill } from '@/lib/queries/vendor-payments'
import { round2 } from '@/lib/payables-math'
import { AllocationEditor, num, summarise } from './allocation-editor'

export function PaymentForm({
  vendors,
  initialVendorId,
  initialBills,
  initialOpeningLeft,
  initialOpeningAsOf,
  initialAmount,
  initialBillId,
  modes,
}: {
  vendors: { id: string; name: string }[]
  initialVendorId: string
  initialBills: OpenBill[]
  initialOpeningLeft: number
  initialOpeningAsOf: Date | null
  /** Prefilled from a bill's "Record payment" button. */
  initialAmount: number
  initialBillId: string
  modes: PaymentModeOption[]
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createVendorPayment,
    { status: 'idle' },
  )

  const [vendorId, setVendorId] = useState(initialVendorId)
  const [bills, setBills] = useState<OpenBill[]>(initialBills)
  const [loading, startLoading] = useTransition()
  const [amount, setAmount] = useState(initialAmount > 0 ? String(initialAmount) : '')
  const [applied, setApplied] = useState<Record<string, string>>(() => {
    const bill = initialBills.find((row) => row.id === initialBillId)

    return bill && initialAmount > 0
      ? { [bill.id]: String(round2(Math.min(initialAmount, bill.due))) }
      : {}
  })
  const [openingLeft, setOpeningLeft] = useState(initialOpeningLeft)
  const [openingAsOf, setOpeningAsOf] = useState(initialOpeningAsOf)
  const [opening, setOpening] = useState('')
  const [channelId, setChannelId] = useState(modes[0]?.id ?? '')
  const method = modes.find((mode) => mode.id === channelId)?.kind

  function pickVendor(nextId: string) {
    setVendorId(nextId)
    setApplied({})
    setOpening('')

    if (!nextId) {
      setBills([])
      setOpeningLeft(0)
      return
    }

    startLoading(async () => {
      const result = await openBillsFor(nextId)

      setBills(result.bills)
      setOpeningLeft(result.openingLeft)
      setOpeningAsOf(result.openingAsOf)
    })
  }

  const total = num(amount)
  const { openingAmount, allocated, unapplied, overApplied, openingTooMuch } = summarise(
    bills,
    applied,
    opening,
    openingLeft,
    total,
  )
  const serialised = JSON.stringify(
    bills
      .map((bill) => ({ billId: bill.id, amount: num(applied[bill.id] ?? '') }))
      .filter((row) => row.amount > 0),
  )
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const dueTotal = round2(bills.reduce((sum, bill) => sum + bill.due, 0))

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="allocations" value={serialised} />
      <input type="hidden" name="openingApplied" value={openingAmount || ''} />

      {state.status === 'error' ? <FormBanner tone="error">{state.message}</FormBanner> : null}

      <Fieldset>
        <Legend>Payment</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Vendor</Label>
              <Select
                value={vendorId}
                onChange={(event) => pickVendor(event.target.value)}
                invalid={Boolean(errors.vendorId)}
              >
                <option value="">Select a vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </Select>
              {errors.vendorId ? <ErrorMessage>{errors.vendorId}</ErrorMessage> : null}
              {vendorId ? (
                <Description>
                  {loading
                    ? 'Loading open bills…'
                    : bills.length === 0
                      ? 'No open bills — this will be kept as an advance to the vendor.'
                      : `${bills.length} open bill${bills.length === 1 ? '' : 's'}, ${currency.format(dueTotal)} outstanding`}
                  {!loading && openingLeft > 0
                    ? ` Opening payable ${currency.format(openingLeft)} also outstanding.`
                    : ''}
                </Description>
              ) : null}
            </Field>
            <Field>
              <Label>Amount paid</Label>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                invalid={Boolean(errors.amount)}
              />
              {errors.amount ? <ErrorMessage>{errors.amount}</ErrorMessage> : null}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Paid on</Label>
              <Input
                name="paidOn"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
            <Field>
              <Label>Mode</Label>
              <PaymentModeSelect
                name="channelId"
                modes={modes}
                value={channelId}
                onChange={setChannelId}
                remember
              />
              {errors.channelId ? <ErrorMessage>{errors.channelId}</ErrorMessage> : null}
            </Field>
          </div>

          <PaymentMethodFields
            mode={method}
            direction="out"
            errors={errors}
            defaultValues={detailsFromJson(state.status === 'error' ? state.values?.paymentDetails : null)}
          />

          <Field>
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} />
          </Field>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Apply to bills</Legend>

        {bills.length === 0 && openingLeft <= 0 ? (
          <Text className="mt-4">
            {vendorId
              ? 'This vendor has no open bills. The full amount will be kept as an advance to the vendor and can be applied to a later bill.'
              : 'Pick a vendor to see their open bills.'}
          </Text>
        ) : (
          <div className="mt-4">
            <AllocationEditor
              bills={bills}
              openingLeft={openingLeft}
              openingAsOf={openingAsOf}
              amount={total}
              applied={applied}
              onApplied={setApplied}
              opening={opening}
              onOpening={setOpening}
            />
            {openingTooMuch ? (
              <ErrorMessage className="mt-2">
                That is more than the opening payable outstanding.
              </ErrorMessage>
            ) : null}
          </div>
        )}

        <div className="mt-6 max-w-sm rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <dl className="grid grid-cols-2 gap-y-2 text-sm/6">
            <dt className="text-zinc-500 dark:text-zinc-400">Paid</dt>
            <dd className="text-right tabular-nums">{currency.format(total)}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Applied</dt>
            <dd className="text-right tabular-nums">{currency.format(allocated)}</dd>
            <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
              {unapplied < 0 ? 'Over-applied' : 'Advance to vendor'}
            </dt>
            <dd
              className={
                overApplied
                  ? 'border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums text-red-600 dark:border-white/10 dark:text-red-400'
                  : 'border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums dark:border-white/10'
              }
            >
              {currency.format(unapplied)}
            </dd>
          </dl>
          {overApplied ? (
            <p className="mt-3 text-sm/6 text-red-600 dark:text-red-400">
              You have applied more than the amount paid, or more than a bill has outstanding.
            </p>
          ) : unapplied > 0 ? (
            <p className="mt-3 text-sm/6 text-zinc-500 dark:text-zinc-400">
              The unapplied amount is kept as an advance to the vendor and can be applied to a
              bill later. With one open bill (and no opening payable) it is applied for you.
            </p>
          ) : null}
        </div>
      </Fieldset>

      <div className="flex justify-end gap-3">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || overApplied || total <= 0 || !vendorId}>
          {pending ? 'Saving…' : 'Save payment'}
        </Button>
      </div>
    </form>
  )
}
