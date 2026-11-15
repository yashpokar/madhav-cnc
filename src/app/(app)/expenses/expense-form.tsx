'use client'

import { PaymentModeSelect } from '@/components/payment-mode-select'
import { PaymentMethodFields, detailsFromJson } from '@/components/payment-method-fields'
import type { PaymentModeOption } from '@/lib/queries/payment-modes'
import { money as currency } from '@/lib/format'
import { useActionState, useEffect, useState, useRef } from 'react'
import { useDirtyGuard } from '@/lib/use-dirty-guard'
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
import { loadDefaults, rememberDefaults } from '@/lib/form-defaults'
import { useQuickContext } from '@/lib/quick-context'
import { QuickNameDialog } from '@/components/quick-name-dialog'
import { VendorPicker, type VendorOption } from '@/components/vendor-picker'
import { quickCreateExpenseCategory, type FormState } from '@/lib/actions/expenses'

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
  channelId: string | null
  reference: string | null
  /** The method's fixed fields as saved; null for older entries with only a reference. */
  paymentDetails?: Record<string, string> | null
  notes: string | null
  orderId: string | null
}

export function ExpenseForm({
  action,
  values,
  categories: initialCategories,
  orders,
  vendors,
  modes,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: ExpenseFormValues
  categories: { id: string; name: string }[]
  orders: { id: string; number: string; customerName: string }[]
  vendors: VendorOption[]
  modes: PaymentModeOption[]
  submitLabel: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  useDirtyGuard(formRef)
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | number | null | undefined) =>
    submitted[name] ??
    (fallback === null || fallback === undefined ? '' : String(fallback))

  const [createdCategories, setCreatedCategories] = useState<
    { id: string; name: string }[]
  >([])
  const categories = [...initialCategories, ...createdCategories]
  const [categoryId, setCategoryId] = useState(
    keep('categoryId', values.categoryId),
  )
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const [channelId, setChannelId] = useState(keep('channelId', values.channelId) || (modes[0]?.id ?? ''))
  const method = modes.find((mode) => mode.id === channelId)?.kind
  const [payee, setPayee] = useState(keep('payeeName', values.payeeName))
  const [amount, setAmount] = useState(keep('amount', values.amount))
  const quick = useQuickContext()
  const [taxRate, setTaxRate] = useState(
    keep('taxRatePercent', values.taxRatePercent),
  )

  const isNew = values.amount === 0

  useEffect(() => {
    if (!isNew || !quick.userId) return

    const last = loadDefaults(quick.userId, quick.companyId).gstRate

    // Syncing from browser storage, which only exists after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last !== undefined) setTaxRate(String(last))
  }, [isNew, quick.userId, quick.companyId])

  const base = Number(amount) || 0
  const tax = Math.round(base * ((Number(taxRate) || 0) / 100) * 100) / 100
  const total = Math.round((base + tax) * 100) / 100

  return (
    <form ref={formRef} action={formAction} className="grid w-full max-w-5xl grid-cols-1 gap-6">
      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Expense</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
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
              <VendorPicker options={vendors} value={payee} onChange={setPayee} />
              <input type="hidden" name="payeeName" value={payee} />
              {errors.payeeName ? (
                <ErrorMessage>{errors.payeeName}</ErrorMessage>
              ) : null}
            </Field>
            <Field>
              <Label>Category</Label>
              <Select
                name="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <Button type="button" plain onClick={() => setNewCategoryOpen(true)}>
                + New category
              </Button>
              <QuickNameDialog
                open={newCategoryOpen}
                onClose={() => setNewCategoryOpen(false)}
                title="New expense category"
                label="Category name"
                save={async (name) => {
                  const result = await quickCreateExpenseCategory(name)

                  if (!result.ok) {
                    return result.error
                  }

                  setCreatedCategories((current) =>
                    current.some((entry) => entry.id === result.category.id)
                      ? current
                      : [...current, result.category],
                  )
                  setCategoryId(result.category.id)

                  return null
                }}
              />
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
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
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
                onChange={(event) => {
                  setTaxRate(event.target.value)
                  const rate = Number(event.target.value)

                  if (isNew && quick.userId && rate > 0) {
                    rememberDefaults(quick.userId, quick.companyId, { gstRate: rate })
                  }
                }}
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

          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
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
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field>
              <Label>Mode</Label>
              <PaymentModeSelect
                name="channelId"
                modes={modes}
                value={channelId}
                onChange={setChannelId}
                remember={!values.channelId}
              />
              {errors.channelId ? <ErrorMessage>{errors.channelId}</ErrorMessage> : null}
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

          <PaymentMethodFields
            mode={method}
            direction="out"
            errors={errors}
            defaultValues={
              submitted.paymentDetails !== undefined
                ? detailsFromJson(submitted.paymentDetails)
                : (values.paymentDetails ?? undefined)
            }
          />

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

      <div className="form-actions">
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
