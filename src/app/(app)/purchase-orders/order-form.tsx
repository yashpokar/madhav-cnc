'use client'

import { money as currency } from '@/lib/format'
import { useActionState, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Divider } from '@/components/catalyst/divider'
import {
  Field,
  FieldGroup,
  Fieldset,
  Label,
  Legend,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import { VendorPicker } from '@/components/vendor-picker'
import {
  PurchaseLineEditor,
  type PurchaseLine,
} from '@/components/purchase-line-editor'
import { resolveVendor } from '@/lib/actions/purchase-bills'
import type { FormState } from '@/lib/actions/purchase-orders'
import { orderLineTotal } from '@/lib/purchase-rules'
import type {
  PurchasableOptions,
  PurchaseVendorOption,
} from '@/lib/queries/purchases'

export type OrderFormValues = {
  vendorId: string
  vendorName: string
  orderDate: string
  expectedDate: string | null
  notes: string | null
  lines: PurchaseLine[]
}

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function OrderForm({
  action,
  values,
  vendors,
  options,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: OrderFormValues
  vendors: PurchaseVendorOption[]
  options: PurchasableOptions
  submitLabel: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {
    status: 'idle',
  })
  const [, startLookup] = useTransition()

  const [vendorId, setVendorId] = useState(values.vendorId)
  const [vendorName, setVendorName] = useState(values.vendorName)
  const [lines, setLines] = useState(values.lines)

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const lineError = Object.entries(errors).find(([key]) => key.startsWith('lines'))?.[1]

  const total = useMemo(
    () =>
      Math.round(
        lines.reduce(
          (sum, line) =>
            sum +
            orderLineTotal({
              qty: num(line.qty),
              rate: num(line.rate),
              taxRatePercent: num(line.taxRatePercent),
            }),
          0,
        ) * 100,
      ) / 100,
    [lines],
  )

  function pickVendor(name: string) {
    setVendorName(name)

    if (!name) {
      setVendorId('')
      return
    }

    startLookup(async () => {
      const vendor = await resolveVendor(name)

      setVendorId(vendor?.id ?? '')

      if (vendor) setVendorName(vendor.name)
    })
  }

  const serialised = JSON.stringify(
    lines.map((line) => ({
      itemId: line.itemId,
      materialId: line.materialId,
      description: line.description,
      unit: line.unit,
      qty: line.qty,
      rate: line.rate,
      taxRatePercent: line.taxRatePercent,
    })),
  )

  return (
    <form action={formAction} className="grid w-full max-w-6xl grid-cols-1 gap-6">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="lines" value={serialised} />

      {state.status === 'error' ? <FormBanner tone="error">{state.message}</FormBanner> : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Order</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field>
              <Label>Vendor</Label>
              <VendorPicker
                options={vendors}
                value={vendorName}
                onChange={pickVendor}
                placeholder="Search or add a vendor"
              />
              {errors.vendorId ? (
                <p className="mt-1 text-xs/5 text-red-600">{errors.vendorId}</p>
              ) : null}
            </Field>
            <Field>
              <Label>Order date</Label>
              <Input name="orderDate" type="date" defaultValue={values.orderDate} required />
            </Field>
            <Field>
              <Label>Expected on</Label>
              <Input
                name="expectedDate"
                type="date"
                defaultValue={values.expectedDate ?? ''}
              />
            </Field>
          </div>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Lines</Legend>
        {lineError ? (
          <div className="mt-4">
            <FormBanner tone="error">{lineError}</FormBanner>
          </div>
        ) : null}
        <div className="mt-6">
          <PurchaseLineEditor
            lines={lines}
            onChange={setLines}
            options={options}
            withHsn={false}
            withDiscount={false}
            errorFor={(index) =>
              Object.entries(errors).find(([key]) => key.startsWith(`lines.${index}.`))?.[1]
            }
          />
        </div>
      </Fieldset>

      <Divider />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Field>
          <Label>Notes for the vendor</Label>
          <Textarea name="notes" rows={4} defaultValue={values.notes ?? ''} />
        </Field>
        <div className="self-start surface-card p-4">
          <dl className="grid grid-cols-2 gap-y-2 text-sm/6">
            <dt className="font-medium">Order total (incl. GST)</dt>
            <dd className="text-right text-base/6 font-semibold tabular-nums">
              {currency.format(total)}
            </dd>
          </dl>
        </div>
      </div>

      <div className="form-actions">
        <Button type="button" plain onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !vendorId}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
