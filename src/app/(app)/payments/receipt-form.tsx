'use client'

import { PaymentModeSelect } from '@/components/payment-mode-select'
import type { PaymentModeOption } from '@/lib/queries/payment-modes'
import { date as dateFormat, money as currency } from '@/lib/format'
import { useActionState, useState, useTransition, useRef } from 'react'
import { useDirtyGuard } from '@/lib/use-dirty-guard'
import { useRouter } from 'next/navigation'
import { CustomerCombobox } from '@/components/customer-combobox'
import type { CustomerOption } from '@/lib/queries/quotations'
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
import { Textarea } from '@/components/catalyst/textarea'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { createReceipt, openInvoicesFor } from '@/lib/actions/payments'
import type { FormState } from '@/lib/actions/payments'
import type { OpenInvoice } from '@/lib/queries/payments'

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function ReceiptForm({
  customers: initialCustomers,
  initialCustomerId,
  initialInvoices,
  initialOpeningLeft,
  modes,
}: {
  customers: { id: string; name: string; phone: string }[]
  initialCustomerId: string
  initialInvoices: OpenInvoice[]
  initialOpeningLeft: number
  modes: PaymentModeOption[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  useDirtyGuard(formRef)
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createReceipt,
    { status: 'idle' },
  )

  const [customerId, setCustomerId] = useState(initialCustomerId)
  const customerOptions: CustomerOption[] = initialCustomers.map((customer) => ({
    id: customer.id,
    code: '',
    name: customer.name,
    phone: customer.phone,
    city: null,
    address: null,
    pincode: null,
    preferredArchitectId: null,
    preferredCarpenterId: null,
    paymentTermsDays: null,
  }))
  // Holds a customer added on the spot, which is not in the server list yet.
  const [picked, setPicked] = useState<CustomerOption | null>(null)
  const selectedCustomer =
    picked?.id === customerId ? picked : (customerOptions.find((option) => option.id === customerId) ?? null)
  const [invoices, setInvoices] = useState<OpenInvoice[]>(initialInvoices)
  const [loading, startLoading] = useTransition()
  const [amount, setAmount] = useState('')
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [openingLeft, setOpeningLeft] = useState(initialOpeningLeft)
  const [openingApplied, setOpeningApplied] = useState('')

  function pickCustomer(nextId: string) {
    setCustomerId(nextId)
    setApplied({})
    setOpeningApplied('')

    if (!nextId) {
      setInvoices([])
      setOpeningLeft(0)
      return
    }

    startLoading(async () => {
      const result = await openInvoicesFor(nextId)

      setInvoices(result.invoices)
      setOpeningLeft(result.openingLeft)
    })
  }

  const total = num(amount)
  const openingAmount = openingLeft > 0 ? num(openingApplied) : 0
  const allocated = round2(
    invoices.reduce((sum, invoice) => sum + num(applied[invoice.id] ?? ''), 0) +
      openingAmount,
  )
  const openingTooMuch = openingAmount > openingLeft + 0.005
  const unallocated = round2(total - allocated)
  const overApplied = allocated > total + 0.005 || openingTooMuch

  function autoAllocate() {
    let left = total
    const next: Record<string, string> = {}

    for (const invoice of invoices) {
      if (left <= 0) break

      const take = round2(Math.min(left, invoice.due))
      next[invoice.id] = String(take)
      left = round2(left - take)
    }

    setApplied(next)
    setOpeningApplied('')
  }

  const serialised = JSON.stringify(
    invoices
      .map((invoice) => ({
        invoiceId: invoice.id,
        amount: num(applied[invoice.id] ?? ''),
      }))
      .filter((row) => row.amount > 0),
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const dueTotal = round2(
    invoices.reduce((sum, invoice) => sum + invoice.due, 0),
  )

  return (
    <form ref={formRef} action={formAction} className="grid w-full max-w-5xl grid-cols-1 gap-6">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="allocations" value={serialised} />
      <input type="hidden" name="openingApplied" value={openingAmount || ''} />

      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Receipt</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field>
              <Label>Customer</Label>
              <CustomerCombobox
                options={customerOptions}
                value={selectedCustomer}
                onChange={(option) => {
                  setPicked(option)
                  pickCustomer(option?.id ?? '')
                }}
              />
              {errors.customerId ? (
                <ErrorMessage>{errors.customerId}</ErrorMessage>
              ) : null}
              {customerId ? (
                <Description>
                  {loading
                    ? 'Loading open invoices…'
                    : invoices.length === 0
                      ? 'No open invoices — this will sit on account.'
                      : `${invoices.length} open invoice${invoices.length === 1 ? '' : 's'}, ${currency.format(dueTotal)} outstanding`}
                  {!loading && openingLeft > 0
                    ? ` Opening balance ${currency.format(openingLeft)} also outstanding.`
                    : ''}
                </Description>
              ) : null}
            </Field>
            <Field>
              <Label>Amount received</Label>
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
              {errors.amount ? (
                <ErrorMessage>{errors.amount}</ErrorMessage>
              ) : null}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field>
              <Label>Received on</Label>
              <Input
                name="paidOn"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
            <Field>
              <Label>Mode</Label>
              <PaymentModeSelect name="channelId" modes={modes} remember />
            </Field>
            <Field>
              <Label>Reference</Label>
              <Input name="reference" placeholder="UTR, cheque no." />
            </Field>
          </div>

          <Field>
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} />
          </Field>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Apply to invoices</Legend>

        {invoices.length === 0 ? (
          <Text className="mt-4">
            {customerId
              ? openingLeft > 0
                ? 'This customer has no open invoices. Without a choice below, the amount goes to their opening balance first and any excess sits on account.'
                : 'This customer has no open invoices. The full amount will sit on account and can be applied to a future invoice.'
              : 'Pick a customer to see their open invoices.'}
          </Text>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                outline
                type="button"
                disabled={total <= 0}
                onClick={autoAllocate}
              >
                Apply oldest first
              </Button>
              <Button
                outline
                type="button"
                onClick={() => {
                  setApplied({})
                  setOpeningApplied('')
                }}
              >
                Clear
              </Button>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="stack-table w-full min-w-[44rem] text-left text-sm/6">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Invoice</th>
                    <th className="pb-2 pr-3 font-medium">Due date</th>
                    <th className="w-32 pb-2 pr-3 text-right font-medium">
                      Total
                    </th>
                    <th className="w-32 pb-2 pr-3 text-right font-medium">
                      Outstanding
                    </th>
                    <th className="w-36 pb-2 text-right font-medium">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="align-top">
                      <td data-label="Invoice" className="py-2 pr-3 pt-4 font-mono text-xs">
                        {invoice.number}
                      </td>
                      <td data-label="Due date" data-half className="py-2 pr-3 pt-4 text-zinc-500 dark:text-zinc-400">
                        {invoice.dueDate
                          ? dateFormat.format(invoice.dueDate)
                          : dateFormat.format(invoice.invoiceDate)}
                      </td>
                      <td data-label="Total" data-half className="py-2 pr-3 pt-4 text-right tabular-nums">
                        {currency.format(invoice.total)}
                      </td>
                      <td data-label="Outstanding" data-half className="py-2 pr-3 pt-4 text-right font-medium tabular-nums">
                        {currency.format(invoice.due)}
                      </td>
                      <td data-label="Apply" className="py-2">
                        <Input
                          aria-label={`Amount applied to ${invoice.number}`}
                          type="number"
                          step="0.01"
                          min={0}
                          value={applied[invoice.id] ?? ''}
                          onChange={(event) =>
                            setApplied({
                              ...applied,
                              [invoice.id]: event.target.value,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {openingLeft > 0 ? (
          <Field className="mt-6 max-w-sm">
            <Label>Apply to opening balance</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={openingLeft}
              value={openingApplied}
              onChange={(event) => setOpeningApplied(event.target.value)}
              invalid={openingTooMuch}
            />
            <Description>
              {currency.format(openingLeft)} of their opening balance is still
              outstanding.
            </Description>
            {openingTooMuch ? (
              <ErrorMessage>
                That is more than the opening balance outstanding.
              </ErrorMessage>
            ) : null}
          </Field>
        ) : null}

        <div className="mt-6 max-w-sm rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <dl className="grid grid-cols-2 gap-y-2 text-sm/6">
            <dt className="text-zinc-500 dark:text-zinc-400">Received</dt>
            <dd className="text-right tabular-nums">
              {currency.format(total)}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Applied</dt>
            <dd className="text-right tabular-nums">
              {currency.format(allocated)}
            </dd>
            <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
              {unallocated < 0 ? 'Over-applied' : 'On account'}
            </dt>
            <dd
              className={
                overApplied
                  ? 'border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums text-red-600 dark:border-white/10 dark:text-red-400'
                  : 'border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums dark:border-white/10'
              }
            >
              {currency.format(unallocated)}
            </dd>
          </dl>
          {overApplied ? (
            <p className="mt-3 text-sm/6 text-red-600 dark:text-red-400">
              You have applied more than the amount received.
            </p>
          ) : unallocated > 0 ? (
            <p className="mt-3 text-sm/6 text-zinc-500 dark:text-zinc-400">
              This stays as customer credit and can be applied later.
            </p>
          ) : null}
        </div>
      </Fieldset>

      <div className="form-actions">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending || overApplied || total <= 0 || !customerId}
        >
          {pending ? 'Saving…' : 'Save receipt'}
        </Button>
      </div>
    </form>
  )
}
