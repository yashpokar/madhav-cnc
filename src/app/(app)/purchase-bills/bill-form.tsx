'use client'

import { money as currency } from '@/lib/format'
import { useActionState, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Divider } from '@/components/catalyst/divider'
import {
  Description,
  Field,
  FieldGroup,
  Fieldset,
  Label,
  Legend,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Switch, SwitchField } from '@/components/catalyst/switch'
import { Textarea } from '@/components/catalyst/textarea'
import { FormBanner } from '@/components/form-banner'
import { VendorPicker } from '@/components/vendor-picker'
import {
  PurchaseLineEditor,
  type PurchaseLine,
} from '@/components/purchase-line-editor'
import { resolveVendor, suggestBillInterState } from '@/lib/actions/purchase-bills'
import type { FormState } from '@/lib/actions/purchase-bills'
import { billTotals, defaultDueDate } from '@/lib/purchase-rules'
import type {
  PurchasableOptions,
  PurchaseVendorOption,
} from '@/lib/queries/purchases'

export type BillFormValues = {
  vendorId: string
  vendorName: string
  vendorGstin: string | null
  poId: string | null
  vendorBillNumber: string | null
  billDate: string
  dueDate: string | null
  isInterState: boolean
  notes: string | null
  lines: PurchaseLine[]
}

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function BillForm({
  action,
  values,
  vendors,
  options,
  submitLabel,
  isNew,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: BillFormValues
  vendors: PurchaseVendorOption[]
  options: PurchasableOptions
  submitLabel: string
  /** On a new bill the due date follows the bill date until it is set by hand. */
  isNew: boolean
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {
    status: 'idle',
  })
  const [, startLookup] = useTransition()

  const [vendorId, setVendorId] = useState(values.vendorId)
  const [vendorName, setVendorName] = useState(values.vendorName)
  const [billDate, setBillDate] = useState(values.billDate)
  const [dueDate, setDueDate] = useState(values.dueDate ?? '')
  const [dueTouched, setDueTouched] = useState(!isNew)
  const [isInterState, setIsInterState] = useState(values.isInterState)
  const [lines, setLines] = useState(values.lines)

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const lineError = Object.entries(errors).find(([key]) => key.startsWith('lines'))?.[1]

  const { totals } = useMemo(
    () =>
      billTotals(
        lines.map((line) => ({
          qty: num(line.qty),
          rate: num(line.rate),
          discount: num(line.discount),
          taxRatePercent: num(line.taxRatePercent),
        })),
        isInterState,
      ),
    [lines, isInterState],
  )

  function pickVendor(name: string) {
    setVendorName(name)

    if (!name) {
      setVendorId('')
      return
    }

    startLookup(async () => {
      const vendor = await resolveVendor(name)

      if (!vendor) {
        setVendorId('')
        return
      }

      setVendorId(vendor.id)
      setVendorName(vendor.name)

      if (isNew) {
        setIsInterState(await suggestBillInterState(vendor.gstin))
      }
    })
  }

  function changeBillDate(next: string) {
    setBillDate(next)

    if (!dueTouched && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
      setDueDate(defaultDueDate(next, null))
    }
  }

  const serialised = JSON.stringify(
    lines.map((line) => ({
      itemId: line.itemId,
      materialId: line.materialId,
      poLineId: line.poLineId,
      description: line.description,
      hsnCode: line.hsnCode,
      unit: line.unit,
      qty: line.qty,
      rate: line.rate,
      discount: line.discount,
      taxRatePercent: line.taxRatePercent,
    })),
  )

  return (
    <form action={formAction} className="grid w-full max-w-6xl grid-cols-1 gap-6">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="poId" value={values.poId ?? ''} />
      <input type="hidden" name="lines" value={serialised} />
      <input type="hidden" name="isInterState" value={isInterState ? 'true' : 'false'} />

      {state.status === 'error' ? <FormBanner tone="error">{state.message}</FormBanner> : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Bill</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
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
              <Label>Vendor bill number</Label>
              <Input
                name="vendorBillNumber"
                defaultValue={values.vendorBillNumber ?? ''}
                maxLength={60}
              />
              <Description>The number printed on the vendor&apos;s own bill.</Description>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field>
              <Label>Bill date</Label>
              <Input
                name="billDate"
                type="date"
                value={billDate}
                onChange={(event) => changeBillDate(event.target.value)}
                required
              />
            </Field>
            <Field>
              <Label>Due date</Label>
              <Input
                name="dueDate"
                type="date"
                value={dueDate}
                onChange={(event) => {
                  setDueTouched(true)
                  setDueDate(event.target.value)
                }}
              />
              <Description>Defaults to 30 days after the bill date.</Description>
            </Field>
            <SwitchField>
              <Label>Inter-state purchase</Label>
              <Description>
                On for IGST, off for CGST plus SGST. Suggested from the GSTINs; change it if
                that is wrong.
              </Description>
              <Switch checked={isInterState} onChange={setIsInterState} />
            </SwitchField>
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
            errorFor={(index) =>
              Object.entries(errors).find(([key]) => key.startsWith(`lines.${index}.`))?.[1]
            }
          />
        </div>
      </Fieldset>

      <Divider />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Fieldset>
          <FieldGroup>
            <Field>
              <Label>Notes</Label>
              <Textarea name="notes" rows={5} defaultValue={values.notes ?? ''} />
            </Field>
          </FieldGroup>
        </Fieldset>

        <div className="surface-card p-4">
          <dl className="grid grid-cols-2 gap-y-2 text-sm/6">
            <dt className="text-zinc-500 dark:text-zinc-400">Subtotal</dt>
            <dd className="text-right tabular-nums">{currency.format(totals.subtotal)}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Discount</dt>
            <dd className="text-right tabular-nums">−{currency.format(totals.discount)}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Taxable</dt>
            <dd className="text-right tabular-nums">{currency.format(totals.taxableAmount)}</dd>
            {isInterState ? (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">IGST</dt>
                <dd className="text-right tabular-nums">{currency.format(totals.igst)}</dd>
              </>
            ) : (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">CGST</dt>
                <dd className="text-right tabular-nums">{currency.format(totals.cgst)}</dd>
                <dt className="text-zinc-500 dark:text-zinc-400">SGST</dt>
                <dd className="text-right tabular-nums">{currency.format(totals.sgst)}</dd>
              </>
            )}
            <dt className="text-zinc-500 dark:text-zinc-400">Round off</dt>
            <dd className="text-right tabular-nums">{currency.format(totals.roundOff)}</dd>
            <dt className="border-t border-zinc-950/10 pt-2 font-medium dark:border-white/10">
              Total
            </dt>
            <dd className="border-t border-zinc-950/10 pt-2 text-right font-semibold tabular-nums dark:border-white/10">
              {currency.format(totals.total)}
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
