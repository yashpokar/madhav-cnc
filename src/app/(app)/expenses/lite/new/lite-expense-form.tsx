'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { ErrorMessage, Field, FieldGroup, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { FormBanner } from '@/components/form-banner'
import { VendorCombobox } from '@/components/vendor-combobox'
import { createLiteExpense, type FormState } from '@/lib/actions/expenses'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import { PaymentMode } from '@/generated/prisma/enums'

export function LiteExpenseForm({
  vendors,
  today,
}: {
  vendors: string[]
  today: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createLiteExpense,
    { status: 'idle' },
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}

      <FieldGroup>
        <Field>
          <Label>Vendor</Label>
          <VendorCombobox
            name="payeeName"
            options={vendors}
            defaultValue={submitted.payeeName ?? ''}
            invalid={Boolean(errors.payeeName)}
          />
          {errors.payeeName ? <ErrorMessage>{errors.payeeName}</ErrorMessage> : null}
        </Field>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field>
            <Label>Amount</Label>
            <Input
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              defaultValue={submitted.amount ?? ''}
              required
              invalid={Boolean(errors.amount)}
            />
            {errors.amount ? <ErrorMessage>{errors.amount}</ErrorMessage> : null}
          </Field>
          <Field>
            <Label>Payment method</Label>
            <Select
              name="paymentMode"
              defaultValue={submitted.paymentMode ?? 'BANK_TRANSFER'}
            >
              {Object.values(PaymentMode).map((mode) => (
                <option key={mode} value={mode}>
                  {PAYMENT_MODE_LABELS[mode]}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Date</Label>
            <Input
              name="expenseDate"
              type="date"
              defaultValue={submitted.expenseDate ?? today}
              required
              invalid={Boolean(errors.expenseDate)}
            />
            {errors.expenseDate ? <ErrorMessage>{errors.expenseDate}</ErrorMessage> : null}
          </Field>
        </div>
      </FieldGroup>

      <div className="flex justify-end gap-3">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save expense'}
        </Button>
      </div>
    </form>
  )
}
