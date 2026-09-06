'use client'

import { useActionState, useMemo, useState } from 'react'
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
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox'
import { Switch, SwitchField } from '@/components/catalyst/switch'
import { Textarea } from '@/components/catalyst/textarea'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { UNIT_SHORT } from '@/lib/labels'
import { documentTotals, splitGst } from '@/lib/pricing'
import type { FormState } from '@/lib/actions/invoices'
import { DiscountType, UnitOfMeasure } from '@/generated/prisma/enums'

export type InvoiceLineValue = {
  key: string
  itemId: string | null
  description: string
  hsnCode: string | null
  unit: UnitOfMeasure
  quantity: string
  rate: string
  discountPercent: string
  taxRatePercent: string
}

export type InvoiceFormValues = {
  customerId: string
  customerName: string
  orderId: string | null
  invoiceDate: string
  dueDate: string | null
  placeOfSupply: string | null
  isInterState: boolean
  billingAddress: string | null
  customerGstin: string | null
  discountType: DiscountType
  discountValue: number
  transportCharge: number
  transportTaxRatePercent: number
  advanceAdjusted: number
  notes: string | null
  terms: string | null
  lines: InvoiceLineValue[]
}

const DISCOUNT_LABELS: Record<DiscountType, string> = {
  NONE: 'No discount',
  PERCENT: 'Percent of subtotal',
  AMOUNT: 'Flat amount',
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function InvoiceForm({
  action,
  values,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: InvoiceFormValues
  submitLabel: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const [lines, setLines] = useState(values.lines)
  const [discountType, setDiscountType] = useState(values.discountType)
  const [discountValue, setDiscountValue] = useState(String(values.discountValue))
  const [transportCharge, setTransportCharge] = useState(
    String(values.transportCharge),
  )
  const [transportTaxRate, setTransportTaxRate] = useState(
    String(values.transportTaxRatePercent),
  )
  const [advanceAdjusted, setAdvanceAdjusted] = useState(
    String(values.advanceAdjusted),
  )
  const [isInterState, setIsInterState] = useState(values.isInterState)

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | null) =>
    submitted[name] ?? fallback ?? ''

  const totals = useMemo(
    () =>
      documentTotals({
        lines: lines.map((line) => ({
          quantity: num(line.quantity),
          rate: num(line.rate),
          discountPercent: num(line.discountPercent),
          taxRatePercent: num(line.taxRatePercent),
        })),
        discountType,
        discountValue: num(discountValue),
        transportCharge: num(transportCharge),
        transportTaxRatePercent: num(transportTaxRate),
      }),
    [lines, discountType, discountValue, transportCharge, transportTaxRate],
  )

  const split = splitGst(totals.taxAmount, isInterState)
  const due = Math.round((totals.total - num(advanceAdjusted)) * 100) / 100

  function update(index: number, patch: Partial<InvoiceLineValue>) {
    setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const serialised = JSON.stringify(
    lines.map((line) => ({
      itemId: line.itemId,
      description: line.description,
      hsnCode: line.hsnCode,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.rate,
      discountPercent: line.discountPercent,
      taxRatePercent: line.taxRatePercent,
    })),
  )

  const lineError = Object.entries(errors).find(([key]) =>
    key.startsWith('lines'),
  )?.[1]

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      <input type="hidden" name="customerId" value={values.customerId} />
      <input type="hidden" name="orderId" value={values.orderId ?? ''} />
      <input type="hidden" name="lines" value={serialised} />
      <input
        type="hidden"
        name="isInterState"
        value={isInterState ? 'true' : 'false'}
      />

      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Invoice</Legend>
        <FieldGroup>
          <Text>Billing {values.customerName}</Text>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Invoice date</Label>
              <Input
                name="invoiceDate"
                type="date"
                defaultValue={keep('invoiceDate', values.invoiceDate)}
                required
              />
            </Field>
            <Field>
              <Label>Due date</Label>
              <Input
                name="dueDate"
                type="date"
                defaultValue={keep('dueDate', values.dueDate)}
              />
            </Field>
            <Field>
              <Label>Place of supply</Label>
              <Input
                name="placeOfSupply"
                defaultValue={keep('placeOfSupply', values.placeOfSupply)}
              />
              <Description>The customer's state.</Description>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Customer GSTIN</Label>
              <Input
                name="customerGstin"
                className="uppercase"
                defaultValue={keep('customerGstin', values.customerGstin)}
              />
            </Field>
            <SwitchField>
              <Label>Inter-state supply</Label>
              <Description>
                On for IGST, off for CGST plus SGST. Set from your state and the
                place of supply; change it if that is wrong.
              </Description>
              <Switch checked={isInterState} onChange={setIsInterState} />
            </SwitchField>
          </div>

          <Field>
            <Label>Billing address</Label>
            <Textarea
              name="billingAddress"
              rows={2}
              defaultValue={keep('billingAddress', values.billingAddress)}
            />
          </Field>
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

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm/6">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="w-8 pb-2 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">Description</th>
                <th className="w-24 pb-2 pr-3 font-medium">HSN</th>
                <th className="w-24 pb-2 pr-3 text-right font-medium">Qty</th>
                <th className="w-28 pb-2 pr-3 text-right font-medium">Rate</th>
                <th className="w-20 pb-2 pr-3 text-right font-medium">GST %</th>
                <th className="w-28 pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key} className="align-top">
                  <td className="py-2 pr-2 tabular-nums text-zinc-500 dark:text-zinc-400">
                    {index + 1}
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`Description for line ${index + 1}`}
                      value={line.description}
                      onChange={(event) =>
                        update(index, { description: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`HSN for line ${index + 1}`}
                      value={line.hsnCode ?? ''}
                      onChange={(event) =>
                        update(index, { hsnCode: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`Quantity for line ${index + 1}`}
                      type="number"
                      step="0.001"
                      min={0}
                      value={line.quantity}
                      onChange={(event) =>
                        update(index, { quantity: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`Rate for line ${index + 1}`}
                      type="number"
                      step="0.01"
                      min={0}
                      value={line.rate}
                      onChange={(event) =>
                        update(index, { rate: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`GST for line ${index + 1}`}
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={line.taxRatePercent}
                      onChange={(event) =>
                        update(index, { taxRatePercent: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pt-4 text-right tabular-nums">
                    {currency.format(
                      Math.round(
                        num(line.quantity) *
                          num(line.rate) *
                          (1 - num(line.discountPercent) / 100) *
                          100,
                      ) / 100,
                    )}
                    <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                      {UNIT_SHORT[line.unit]}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Fieldset>

      <Divider />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Fieldset>
          <Legend>Charges</Legend>
          <FieldGroup>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Discount type</Label>
                <Listbox
                  name="discountType"
                  value={discountType}
                  onChange={setDiscountType}
                >
                  {Object.values(DiscountType).map((value) => (
                    <ListboxOption key={value} value={value}>
                      <ListboxLabel>{DISCOUNT_LABELS[value]}</ListboxLabel>
                    </ListboxOption>
                  ))}
                </Listbox>
              </Field>
              <Field>
                <Label>Discount value</Label>
                <Input
                  name="discountValue"
                  type="number"
                  step="0.01"
                  min={0}
                  value={discountValue}
                  disabled={discountType === 'NONE'}
                  onChange={(event) => setDiscountValue(event.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Transport charge</Label>
                <Input
                  name="transportCharge"
                  type="number"
                  step="0.01"
                  min={0}
                  value={transportCharge}
                  onChange={(event) => setTransportCharge(event.target.value)}
                />
              </Field>
              <Field>
                <Label>Transport GST %</Label>
                <Input
                  name="transportTaxRatePercent"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={transportTaxRate}
                  onChange={(event) => setTransportTaxRate(event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <Label>Advance already received</Label>
              <Input
                name="advanceAdjusted"
                type="number"
                step="0.01"
                min={0}
                value={advanceAdjusted}
                onChange={(event) => setAdvanceAdjusted(event.target.value)}
              />
              <Description>Deducted from the amount due.</Description>
            </Field>
          </FieldGroup>
        </Fieldset>

        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <dl className="grid grid-cols-2 gap-y-2 text-sm/6">
            <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
            <dd className="text-right tabular-nums">
              {currency.format(totals.subtotal)}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Discount</dt>
            <dd className="text-right tabular-nums">
              −{currency.format(totals.discountAmount)}
            </dd>
            {num(transportCharge) > 0 ? (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Transport</dt>
                <dd className="text-right tabular-nums">
                  {currency.format(num(transportCharge))}
                </dd>
              </>
            ) : null}
            <dt className="text-zinc-500 dark:text-zinc-400">Taxable</dt>
            <dd className="text-right tabular-nums">
              {currency.format(totals.taxableAmount)}
            </dd>
            {isInterState ? (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">IGST</dt>
                <dd className="text-right tabular-nums">
                  {currency.format(split.igst)}
                </dd>
              </>
            ) : (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">CGST</dt>
                <dd className="text-right tabular-nums">
                  {currency.format(split.cgst)}
                </dd>
                <dt className="text-zinc-500 dark:text-zinc-400">SGST</dt>
                <dd className="text-right tabular-nums">
                  {currency.format(split.sgst)}
                </dd>
              </>
            )}
            <dt className="text-zinc-500 dark:text-zinc-400">Round off</dt>
            <dd className="text-right tabular-nums">
              {currency.format(totals.roundOff)}
            </dd>
            <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
              Total
            </dt>
            <dd className="border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums dark:border-white/10">
              {currency.format(totals.total)}
            </dd>
            {num(advanceAdjusted) > 0 ? (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Advance</dt>
                <dd className="text-right tabular-nums">
                  −{currency.format(num(advanceAdjusted))}
                </dd>
                <dt className="font-medium">Due now</dt>
                <dd className="text-right text-base/6 font-semibold tabular-nums">
                  {currency.format(due)}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      <Divider />

      <Fieldset>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Notes</Label>
              <Textarea
                name="notes"
                rows={4}
                defaultValue={keep('notes', values.notes)}
              />
            </Field>
            <Field>
              <Label>Terms</Label>
              <Textarea
                name="terms"
                rows={4}
                defaultValue={keep('terms', values.terms)}
              />
            </Field>
          </div>
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
