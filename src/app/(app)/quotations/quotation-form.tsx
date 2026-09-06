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
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'
import { Radio, RadioField, RadioGroup } from '@/components/catalyst/radio'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import { PartnerCombobox } from '@/components/partner-combobox'
import {
  MATERIAL_SUPPLY_DESCRIPTIONS,
  MATERIAL_SUPPLY_LABELS,
} from '@/lib/labels'
import { documentTotals } from '@/lib/pricing'
import type { FormState } from '@/lib/actions/quotations'
import type { CustomerOption, ItemOption } from '@/lib/queries/quotations'
import type { PartnerOption } from '@/lib/queries/partners'
import { DiscountType, MaterialSupply } from '@/generated/prisma/enums'
import { currency, emptyLine, LineEditor, type EditorLine } from '@/components/line-editor'

export type QuotationFormValues = {
  customerId: string | null
  architectId: string | null
  carpenterId: string | null
  materialSupply: MaterialSupply
  subject: string | null
  quotationDate: string
  validUntil: string | null
  siteAddress: string | null
  siteCity: string | null
  sitePincode: string | null
  discountType: DiscountType
  discountValue: number
  advancePercent: number
  notes: string | null
  terms: string | null
  lines: EditorLine[]
}

const DISCOUNT_LABELS: Record<DiscountType, string> = {
  NONE: 'No discount',
  PERCENT: 'Percent of subtotal',
  AMOUNT: 'Flat amount',
}

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function QuotationForm({
  action,
  values,
  submitLabel,
  customers,
  items,
  architects,
  carpenters,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: QuotationFormValues
  submitLabel: string
  customers: CustomerOption[]
  items: ItemOption[]
  architects: PartnerOption[]
  carpenters: PartnerOption[]
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const [customer, setCustomer] = useState<CustomerOption | null>(
    customers.find((option) => option.id === values.customerId) ?? null,
  )
  const [partnerKey, setPartnerKey] = useState(0)
  const [architectId, setArchitectId] = useState(values.architectId)
  const [carpenterId, setCarpenterId] = useState(values.carpenterId)
  const [siteAddress, setSiteAddress] = useState(values.siteAddress ?? '')
  const [siteCity, setSiteCity] = useState(values.siteCity ?? '')
  const [sitePincode, setSitePincode] = useState(values.sitePincode ?? '')

  const [materialSupply, setMaterialSupply] = useState<MaterialSupply>(
    values.materialSupply,
  )
  const [discountType, setDiscountType] = useState<DiscountType>(
    values.discountType,
  )
  const [discountValue, setDiscountValue] = useState(String(values.discountValue))
  const [lines, setLines] = useState<EditorLine[]>(
    values.lines.length > 0 ? values.lines : [emptyLine(values.materialSupply)],
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | number | null | undefined) =>
    submitted[name] ?? (fallback === null || fallback === undefined ? '' : String(fallback))

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
      }),
    [lines, discountType, discountValue],
  )

  function pickCustomer(option: CustomerOption | null) {
    setCustomer(option)

    if (!option) return

    setArchitectId(option.preferredArchitectId)
    setCarpenterId(option.preferredCarpenterId)
    setSiteAddress(option.address ?? '')
    setSiteCity(option.city ?? '')
    setSitePincode(option.pincode ?? '')
    setPartnerKey((key) => key + 1)
  }

  const serialisedLines = JSON.stringify(
    lines.map((line) => ({
      itemId: line.itemId,
      description: line.description,
      unit: line.unit,
      materialSupply: line.materialSupply,
      dimensionUnit: line.dimensionUnit,
      length: line.length,
      width: line.width,
      pieces: line.pieces,
      quantity: line.quantity,
      rate: line.rate,
      discountPercent: line.discountPercent,
      taxRatePercent: line.taxRatePercent,
      hsnCode: line.hsnCode,
      notes: line.notes,
    })),
  )

  const lineError = Object.entries(errors).find(([key]) =>
    key.startsWith('lines'),
  )?.[1]

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      <input type="hidden" name="customerId" value={customer?.id ?? ''} />
      <input type="hidden" name="siteAddress" value={siteAddress} />
      <input type="hidden" name="siteCity" value={siteCity} />
      <input type="hidden" name="sitePincode" value={sitePincode} />
      <input type="hidden" name="lines" value={serialisedLines} />

      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Quotation</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field className="sm:col-span-2">
              <Label>Customer</Label>
              <Combobox<CustomerOption | null>
                options={customers}
                value={customer}
                onChange={pickCustomer}
                placeholder="Search customers…"
                displayValue={(option) => option?.name ?? ''}
                filter={(option, query) => {
                  if (!option) return true
                  const haystack = [
                    option.name,
                    option.code,
                    option.phone,
                    option.city,
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                  return haystack.includes(query.toLowerCase())
                }}
              >
                {(option) => (
                  <ComboboxOption value={option}>
                    <ComboboxLabel>{option.name}</ComboboxLabel>
                    <ComboboxDescription>
                      {[option.code, option.phone, option.city]
                        .filter(Boolean)
                        .join(' · ')}
                    </ComboboxDescription>
                  </ComboboxOption>
                )}
              </Combobox>
              {errors.customerId ? (
                <ErrorMessage>{errors.customerId}</ErrorMessage>
              ) : (
                <Description>
                  Picking a customer fills the site address and preferred
                  partners below.
                </Description>
              )}
            </Field>
            <Field>
              <Label>Quotation date</Label>
              <Input
                name="quotationDate"
                type="date"
                defaultValue={keep('quotationDate', values.quotationDate)}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field className="sm:col-span-2">
              <Label>Subject</Label>
              <Input
                name="subject"
                defaultValue={keep('subject', values.subject)}
                placeholder="Kitchen and wardrobes, 3BHK"
              />
            </Field>
            <Field>
              <Label>Valid until</Label>
              <Input
                name="validUntil"
                type="date"
                defaultValue={keep('validUntil', values.validUntil)}
              />
            </Field>
          </div>

          <Field>
            <Label>Default material supply</Label>
            <RadioGroup
              name="materialSupply"
              value={materialSupply}
              onChange={(value) => setMaterialSupply(value as MaterialSupply)}
              className="mt-2"
            >
              {Object.values(MaterialSupply).map((value) => (
                <RadioField key={value}>
                  <Radio value={value} />
                  <Label>{MATERIAL_SUPPLY_LABELS[value]}</Label>
                  <Description>
                    {MATERIAL_SUPPLY_DESCRIPTIONS[value]}
                  </Description>
                </RadioField>
              ))}
            </RadioGroup>
            <Description className="mt-3">
              Applied to new lines. Each line can be set individually below.
            </Description>
          </Field>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field key={`arch-${partnerKey}`}>
              <Label>Architect</Label>
              <PartnerCombobox
                name="architectId"
                type="ARCHITECT"
                options={architects}
                defaultValue={architectId}
                placeholder="Search architects…"
                noneLabel="No architect"
              />
            </Field>
            <Field key={`carp-${partnerKey}`}>
              <Label>Carpenter</Label>
              <PartnerCombobox
                name="carpenterId"
                type="CARPENTER"
                options={carpenters}
                defaultValue={carpenterId}
                placeholder="Search carpenters…"
                noneLabel="No carpenter"
              />
            </Field>
          </div>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Site</Legend>
        <FieldGroup>
          <Field>
            <Label>Site address</Label>
            <Textarea
              rows={2}
              value={siteAddress}
              onChange={(event) => setSiteAddress(event.target.value)}
            />
            <Description>
              Prefilled from the customer. Change it if the job is elsewhere.
            </Description>
          </Field>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>City</Label>
              <Input
                value={siteCity}
                onChange={(event) => setSiteCity(event.target.value)}
              />
            </Field>
            <Field>
              <Label>Pincode</Label>
              <Input
                inputMode="numeric"
                value={sitePincode}
                onChange={(event) => setSitePincode(event.target.value)}
                invalid={Boolean(errors.sitePincode)}
              />
              {errors.sitePincode ? (
                <ErrorMessage>{errors.sitePincode}</ErrorMessage>
              ) : null}
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
          <LineEditor lines={lines} onChange={setLines} items={items} />
        </div>
      </Fieldset>

      <Divider />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Fieldset>
          <Legend>Discount</Legend>
          <FieldGroup>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Type</Label>
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
                <Label>Advance %</Label>
                <Input
                  name="advancePercent"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  defaultValue={keep('advancePercent', values.advancePercent)}
                />
                <Description>Payable before work begins.</Description>
              </Field>
              <Field>
                <Label>Value</Label>
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
            <dt className="text-zinc-500 dark:text-zinc-400">Taxable</dt>
            <dd className="text-right tabular-nums">
              {currency.format(totals.taxableAmount)}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">GST</dt>
            <dd className="text-right tabular-nums">
              {currency.format(totals.taxAmount)}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Round off</dt>
            <dd className="text-right tabular-nums">
              {currency.format(totals.roundOff)}
            </dd>
            <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
              Total
            </dt>
            <dd className="border-t border-zinc-950/10 pt-2 text-right text-base/6 font-semibold tabular-nums dark:border-white/10">
              {currency.format(totals.total)}
            </dd>
          </dl>
        </div>
      </div>

      <Divider />

      <Fieldset>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Notes</Label>
              <Textarea name="notes" rows={4} defaultValue={keep('notes', values.notes)} />
              <Description>Shown to the customer.</Description>
            </Field>
            <Field>
              <Label>Terms &amp; conditions</Label>
              <Textarea name="terms" rows={4} defaultValue={keep('terms', values.terms)} />
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
