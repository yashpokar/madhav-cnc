'use client'

import { useActionState, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, TrashIcon } from '@heroicons/react/16/solid'
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
import {
  NOTE_KIND_DESCRIPTIONS,
  NOTE_KIND_LABELS,
  NOTE_PARTY_LABELS,
  NOTE_REASON_LABELS,
  UNIT_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import { documentTotals, splitGst } from '@/lib/pricing'
import type { FormState } from '@/lib/actions/notes'
import {
  NoteKind,
  NoteParty,
  NoteReason,
  UnitOfMeasure,
} from '@/generated/prisma/enums'

export type NoteLineValue = {
  key: string
  description: string
  hsnCode: string
  unit: UnitOfMeasure
  quantity: string
  rate: string
  taxRatePercent: string
}

export type NoteFormValues = {
  kind: NoteKind
  partyType: NoteParty
  reason: NoteReason
  customerId: string | null
  vendorName: string | null
  vendorGstin: string | null
  invoiceId: string | null
  noteDate: string
  placeOfSupply: string | null
  isInterState: boolean
  reasonNote: string | null
  lines: NoteLineValue[]
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

let lineKeySeed = 0

function blankLine(): NoteLineValue {
  lineKeySeed += 1

  return {
    key: `line-${lineKeySeed}`,
    description: '',
    hsnCode: '',
    unit: 'NOS',
    quantity: '1',
    rate: '',
    taxRatePercent: '18',
  }
}

export function NoteForm({
  action,
  values,
  customers,
  invoices,
  companyState,
  submitLabel,
  lockKind = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: NoteFormValues
  customers: { id: string; name: string; state: string | null }[]
  invoices: { id: string; number: string; customerId: string }[]
  companyState: string | null
  submitLabel: string
  lockKind?: boolean
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const [kind, setKind] = useState(values.kind)
  const [partyType, setPartyType] = useState(values.partyType)
  const [customerId, setCustomerId] = useState(values.customerId ?? '')
  const [isInterState, setIsInterState] = useState(values.isInterState)
  const [lines, setLines] = useState(
    values.lines.length > 0 ? values.lines : [blankLine()],
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | null) =>
    submitted[name] ?? fallback ?? ''

  const isCustomer = partyType === 'CUSTOMER'
  const customerInvoices = invoices.filter(
    (invoice) => invoice.customerId === customerId,
  )

  const totals = useMemo(
    () =>
      documentTotals({
        lines: lines.map((line) => ({
          quantity: num(line.quantity),
          rate: num(line.rate),
          discountPercent: 0,
          taxRatePercent: num(line.taxRatePercent),
        })),
        discountType: 'NONE',
        discountValue: 0,
      }),
    [lines],
  )

  const split = splitGst(totals.taxAmount, isInterState)

  function update(index: number, patch: Partial<NoteLineValue>) {
    setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function pickCustomer(id: string) {
    setCustomerId(id)

    const customer = customers.find((entry) => entry.id === id)

    if (customer && companyState) {
      setIsInterState(
        customer.state
          ? customer.state.trim().toLowerCase() !==
              companyState.trim().toLowerCase()
          : false,
      )
    }
  }

  const serialised = JSON.stringify(
    lines.map((line) => ({
      description: line.description,
      hsnCode: line.hsnCode,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.rate,
      taxRatePercent: line.taxRatePercent,
    })),
  )

  const lineError = Object.entries(errors).find(([key]) =>
    key.startsWith('lines'),
  )?.[1]

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="partyType" value={partyType} />
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
        <Legend>Note</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Type</Label>
              <Select
                value={kind}
                disabled={lockKind}
                onChange={(event) => setKind(event.target.value as NoteKind)}
              >
                {Object.values(NoteKind).map((value) => (
                  <option key={value} value={value}>
                    {NOTE_KIND_LABELS[value]}
                  </option>
                ))}
              </Select>
              <Description>{NOTE_KIND_DESCRIPTIONS[kind]}</Description>
            </Field>
            <Field>
              <Label>Raised against</Label>
              <Select
                value={partyType}
                onChange={(event) =>
                  setPartyType(event.target.value as NoteParty)
                }
              >
                {Object.values(NoteParty).map((value) => (
                  <option key={value} value={value}>
                    {NOTE_PARTY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Reason</Label>
              <Select name="reason" defaultValue={keep('reason', values.reason)}>
                {Object.values(NoteReason).map((value) => (
                  <option key={value} value={value}>
                    {NOTE_REASON_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {isCustomer ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Customer</Label>
                <Select
                  name="customerId"
                  value={customerId}
                  onChange={(event) => pickCustomer(event.target.value)}
                  invalid={Boolean(errors.customerId)}
                >
                  <option value="">Select a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
                {errors.customerId ? (
                  <ErrorMessage>{errors.customerId}</ErrorMessage>
                ) : null}
              </Field>
              <Field>
                <Label>Against invoice</Label>
                <Select
                  name="invoiceId"
                  defaultValue={keep('invoiceId', values.invoiceId)}
                  disabled={customerInvoices.length === 0}
                >
                  <option value="">Not linked</option>
                  {customerInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.number}
                    </option>
                  ))}
                </Select>
                <Description>
                  Link the original invoice so GST returns tie back.
                </Description>
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Vendor</Label>
                <Input
                  name="vendorName"
                  defaultValue={keep('vendorName', values.vendorName)}
                  invalid={Boolean(errors.vendorName)}
                />
                {errors.vendorName ? (
                  <ErrorMessage>{errors.vendorName}</ErrorMessage>
                ) : null}
              </Field>
              <Field>
                <Label>Vendor GSTIN</Label>
                <Input
                  name="vendorGstin"
                  className="uppercase"
                  defaultValue={keep('vendorGstin', values.vendorGstin)}
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Note date</Label>
              <Input
                name="noteDate"
                type="date"
                defaultValue={keep('noteDate', values.noteDate)}
                required
              />
            </Field>
            <Field>
              <Label>Place of supply</Label>
              <Input
                name="placeOfSupply"
                defaultValue={keep('placeOfSupply', values.placeOfSupply)}
              />
            </Field>
          </div>

          <SwitchField>
            <Label>Inter-state supply</Label>
            <Description>
              On for IGST, off for CGST plus SGST.
            </Description>
            <Switch checked={isInterState} onChange={setIsInterState} />
          </SwitchField>
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
          <table className="w-full min-w-[56rem] text-left text-sm/6">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="w-8 pb-2 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">Description</th>
                <th className="w-24 pb-2 pr-3 font-medium">HSN</th>
                <th className="w-32 pb-2 pr-3 font-medium">Unit</th>
                <th className="w-24 pb-2 pr-3 text-right font-medium">Qty</th>
                <th className="w-28 pb-2 pr-3 text-right font-medium">Rate</th>
                <th className="w-20 pb-2 pr-3 text-right font-medium">GST %</th>
                <th className="w-28 pb-2 pr-3 text-right font-medium">Amount</th>
                <th className="w-10 pb-2" />
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
                      value={line.hsnCode}
                      onChange={(event) =>
                        update(index, { hsnCode: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Select
                      aria-label={`Unit for line ${index + 1}`}
                      value={line.unit}
                      onChange={(event) =>
                        update(index, {
                          unit: event.target.value as UnitOfMeasure,
                        })
                      }
                    >
                      {Object.values(UnitOfMeasure).map((unit) => (
                        <option key={unit} value={unit}>
                          {UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </Select>
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
                  <td className="py-2 pr-3 pt-4 text-right tabular-nums">
                    {currency.format(
                      Math.round(num(line.quantity) * num(line.rate) * 100) /
                        100,
                    )}
                    <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                      {UNIT_SHORT[line.unit]}
                    </div>
                  </td>
                  <td className="py-2 pt-3">
                    <Button
                      plain
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines(lines.filter((_, i) => i !== index))
                      }
                    >
                      <TrashIcon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <Button
            outline
            type="button"
            onClick={() => setLines([...lines, blankLine()])}
          >
            <PlusIcon />
            Add line
          </Button>
        </div>
      </Fieldset>

      <Divider />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Fieldset>
          <FieldGroup>
            <Field>
              <Label>Reason detail</Label>
              <Textarea
                name="reasonNote"
                rows={5}
                placeholder="What was returned or corrected, and why."
                defaultValue={keep('reasonNote', values.reasonNote)}
              />
            </Field>
          </FieldGroup>
        </Fieldset>

        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <dl className="grid grid-cols-2 gap-y-2 text-sm/6">
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
              {NOTE_KIND_LABELS[kind]} total
            </dt>
            <dd className="border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums dark:border-white/10">
              {currency.format(totals.total)}
            </dd>
          </dl>
        </div>
      </div>

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
