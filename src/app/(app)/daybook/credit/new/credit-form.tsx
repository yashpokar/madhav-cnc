'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { ErrorMessage, Field, FieldGroup, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { FormBanner } from '@/components/form-banner'
import { VendorCombobox } from '@/components/vendor-combobox'
import { createCashCredit, type FormState } from '@/lib/actions/expenses'
import { PAYMENT_MODE_LABELS } from '@/lib/labels'
import { PaymentMode } from '@/generated/prisma/enums'

export function CreditForm({ sources, today }: { sources: string[]; today: string }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(createCashCredit, {
    status: 'idle',
  })
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      {state.status === 'error' ? <FormBanner tone="error">{state.message}</FormBanner> : null}

      <FieldGroup>
        <Field>
          <Label>Received from</Label>
          <VendorCombobox
            name="sourceName"
            options={sources}
            defaultValue={submitted.sourceName ?? ''}
            invalid={Boolean(errors.sourceName)}
            placeholder="Search or add, e.g. Owner capital, vendor refund"
          />
          {errors.sourceName ? <ErrorMessage>{errors.sourceName}</ErrorMessage> : null}
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
            <Select name="mode" defaultValue={submitted.mode ?? 'CASH'}>
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
              name="entryDate"
              type="date"
              defaultValue={submitted.entryDate ?? today}
              required
              invalid={Boolean(errors.entryDate)}
            />
            {errors.entryDate ? <ErrorMessage>{errors.entryDate}</ErrorMessage> : null}
          </Field>
        </div>

        <Field>
          <Label>Note (optional)</Label>
          <Input
            name="notes"
            defaultValue={submitted.notes ?? ''}
            placeholder="What this was for"
          />
        </Field>
      </FieldGroup>

      <div className="flex justify-end gap-3">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save credit'}
        </Button>
      </div>
    </form>
  )
}
