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
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox'
import { Switch, SwitchField } from '@/components/catalyst/switch'
import { Textarea } from '@/components/catalyst/textarea'
import { Text } from '@/components/catalyst/text'
import { CategoryCombobox } from '@/components/category-combobox'
import { FormBanner } from '@/components/form-banner'
import { ITEM_TYPE_LABELS, UNIT_LABELS, UNIT_SHORT } from '@/lib/labels'
import type { FormState } from '@/lib/actions/items'
import type { ItemCategoryOption } from '@/lib/queries/items'
import { ItemType, UnitOfMeasure } from '@/generated/prisma/enums'

export type ItemFormValues = {
  name: string
  description: string | null
  type: ItemType
  categoryId: string | null
  unit: UnitOfMeasure
  rate: number
  purchaseRate: number | null
  brand: string | null
  shade: string | null
  thicknessMm: number | null
  lengthMm: number | null
  widthMm: number | null
  hsnCode: string | null
  taxRatePercent: number
  isActive: boolean
  notes: string | null
}

function numberValue(value: number | null) {
  return value === null ? '' : String(value)
}

export function ItemForm({
  action,
  values,
  submitLabel,
  categories,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: ItemFormValues
  submitLabel: string
  categories: ItemCategoryOption[]
}) {
  const router = useRouter()
  const [type, setType] = useState<ItemType>(values.type)
  const [unit, setUnit] = useState<UnitOfMeasure>(values.unit)
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const isService = type === 'SERVICE'

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Item</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field className="sm:col-span-2">
              <Label>Name</Label>
              <Input
                name="name"
                defaultValue={values.name}
                required
                invalid={Boolean(errors.name)}
              />
              {errors.name ? <ErrorMessage>{errors.name}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>Type</Label>
              <Listbox name="type" value={type} onChange={setType}>
                {Object.values(ItemType).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{ITEM_TYPE_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Category</Label>
              <CategoryCombobox
                name="categoryId"
                options={categories}
                defaultValue={values.categoryId}
              />
            </Field>
            <Field>
              <Label>Unit</Label>
              <Listbox name="unit" value={unit} onChange={setUnit}>
                {Object.values(UnitOfMeasure).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{UNIT_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>

          <Field>
            <Label>Description</Label>
            <Textarea
              name="description"
              rows={2}
              defaultValue={values.description ?? ''}
            />
          </Field>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Pricing</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Rate per {UNIT_SHORT[unit]}</Label>
              <Input
                name="rate"
                type="number"
                step="0.01"
                min={0}
                defaultValue={values.rate}
                required
                invalid={Boolean(errors.rate)}
              />
              {errors.rate ? <ErrorMessage>{errors.rate}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>Purchase rate</Label>
              <Input
                name="purchaseRate"
                type="number"
                step="0.01"
                min={0}
                defaultValue={numberValue(values.purchaseRate)}
                invalid={Boolean(errors.purchaseRate)}
              />
              <Description>Optional. Used for margin.</Description>
            </Field>
            <Field>
              <Label>GST rate %</Label>
              <Input
                name="taxRatePercent"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={values.taxRatePercent}
                required
                invalid={Boolean(errors.taxRatePercent)}
              />
              {errors.taxRatePercent ? (
                <ErrorMessage>{errors.taxRatePercent}</ErrorMessage>
              ) : null}
            </Field>
          </div>

          <Field>
            <Label>{isService ? 'SAC code' : 'HSN code'}</Label>
            <Input
              name="hsnCode"
              inputMode="numeric"
              defaultValue={values.hsnCode ?? ''}
              invalid={Boolean(errors.hsnCode)}
            />
            {errors.hsnCode ? (
              <ErrorMessage>{errors.hsnCode}</ErrorMessage>
            ) : (
              <Description>
                {isService
                  ? 'Services use a SAC code on GST invoices.'
                  : 'Goods use an HSN code on GST invoices.'}
              </Description>
            )}
          </Field>

          <Text>
            This rate is the current default. Quotations and orders keep the rate
            they were raised with, so changing it here never re-prices past
            records.
          </Text>
        </FieldGroup>
      </Fieldset>

      {isService ? null : (
        <>
          <Divider />

          <Fieldset>
            <Legend>Specification</Legend>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Field>
                  <Label>Brand</Label>
                  <Input name="brand" defaultValue={values.brand ?? ''} />
                </Field>
                <Field>
                  <Label>Shade / finish</Label>
                  <Input name="shade" defaultValue={values.shade ?? ''} />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <Field>
                  <Label>Thickness (mm)</Label>
                  <Input
                    name="thicknessMm"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={numberValue(values.thicknessMm)}
                  />
                </Field>
                <Field>
                  <Label>Length (mm)</Label>
                  <Input
                    name="lengthMm"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={numberValue(values.lengthMm)}
                  />
                </Field>
                <Field>
                  <Label>Width (mm)</Label>
                  <Input
                    name="widthMm"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={numberValue(values.widthMm)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>
        </>
      )}

      <Divider />

      <Fieldset>
        <FieldGroup>
          <Field>
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} defaultValue={values.notes ?? ''} />
          </Field>
          <SwitchField>
            <Label>Active</Label>
            <Description>
              Inactive items stay on past records but cannot be added to new
              ones.
            </Description>
            <Switch name="isActive" defaultChecked={values.isActive} value="true" />
          </SwitchField>
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
