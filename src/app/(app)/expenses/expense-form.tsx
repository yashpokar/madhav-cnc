'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Switch, SwitchField } from '@/components/catalyst/switch'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import type { FormState } from '@/lib/actions/expenses'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import { PaymentMode } from '@/generated/prisma/enums'

export type ExpenseFormValues = {
  categoryId: string | null
  expenseDate: string
  payeeName: string
  description: string | null
  amount: number
  taxRatePercent: number
  isInputCredit: boolean
  vendorGstin: string | null
  billNumber: string | null
  paymentMode: PaymentMode
  reference: string | null
  notes: string | null
  orderId: string | null
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

export function ExpenseForm({
  action,
  values,
  categories,
  orders,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: ExpenseFormValues
  categories: { id: string; name: string }[]
  orders: { id: string; number: string; customerName: string }[]
  submitLabel: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | number | null | undefined) =>
    submitted[name] ??
    (fallback === null || fallback === undefined ? '' : String(fallback))

  const [amount, setAmount] = useState(keep('amount', values.amount))
  const [taxRate, setTaxRate] = useState(
    keep('taxRatePercent', values.taxRatePercent),
  )

  const base = Number(amount) || 0
  const tax = Math.round(base * ((Number(taxRate) || 0) / 100) * 100) / 100
  const total = Math.round((base + tax) * 100) / 100

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Expense</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Date</Label>
              <Input
                name="expenseDate"
                type="date"
                defaultValue={keep('expenseDate', values.expenseDate)}
                required
                invalid={Boolean(errors.expenseDate)}
              />
              {errors.expenseDate ? (
                <ErrorMessage>{errors.expenseDate}</ErrorMessage>
              ) : null}
            </Field>
            <Field>
              <Label>Paid to</Label>
              <Input
                name="payeeName"
                defaultValue={keep('payeeName', values.payeeName)}
                required
                invalid={Boolean(errors.payeeName)}
              />
              {errors.payeeName ? (
                <ErrorMessage>{errors.payeeName}</ErrorMessage>
              ) : null}
            </Field>
            <Field>
              <Label>Category</Label>
              <Select
                name="categoryId"
                defaultValue={keep('categoryId', values.categoryId)}
              >
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field>
            <Label>Description</Label>
            <Textarea
              name="description"
              rows={2}
              defaultValue={keep('description', values.description)}
            />
          </Field>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Amount</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Amount before tax</Label>
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
            <Field>
              <Label>GST %</Label>
              <Input
                name="taxRatePercent"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={taxRate}
                onChange={(event) => setTaxRate(event.target.value)}
              />
            </Field>
            <Field>
              <Label>Total</Label>
              <div className="pt-2.5 text-base/6 font-medium tabular-nums sm:text-sm/6">
                {currency.format(total)}
              </div>
              <Description>
                {currency.format(base)} + {currency.format(tax)} tax
              </Description>
            </Field>
          </div>

          <SwitchField>
            <Label>Claim input tax credit</Label>
            <Description>
              Tick when the bill is in the firm&rsquo;s name with a valid GSTIN.
            </Description>
            <Switch
              name="isInputCredit"
              defaultChecked={values.isInputCredit}
              value="true"
            />
          </SwitchField>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Vendor GSTIN</Label>
              <Input
                name="vendorGstin"
                defaultValue={keep('vendorGstin', values.vendorGstin)}
                invalid={Boolean(errors.vendorGstin)}
              />
            </Field>
            <Field>
              <Label>Bill number</Label>
              <Input
                name="billNumber"
                defaultValue={keep('billNumber', values.billNumber)}
              />
            </Field>
          </div>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Payment</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Mode</Label>
              <Select
                name="paymentMode"
                defaultValue={keep('paymentMode', values.paymentMode)}
              >
                {Object.values(PaymentMode).map((mode) => (
                  <option key={mode} value={mode}>
                    {PAYMENT_MODE_LABELS[mode]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Reference</Label>
              <Input
                name="reference"
                placeholder="UTR, cheque no."
                defaultValue={keep('reference', values.reference)}
              />
            </Field>
            <Field>
              <Label>Against order</Label>
              <Select name="orderId" defaultValue={keep('orderId', values.orderId)}>
                <option value="">Not job specific</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.number} — {order.customerName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field>
            <Label>Notes</Label>
            <Textarea
              name="notes"
              rows={3}
              defaultValue={keep('notes', values.notes)}
            />
          </Field>
        </FieldGroup>
      </Fieldset>

      <div className="flex justify-end gap-3">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
