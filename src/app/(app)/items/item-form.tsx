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
import { MaterialCombobox } from '@/components/material-combobox'
import { FormBanner } from '@/components/form-banner'
import {
  DIMENSION_UNIT_LABELS,
  DIMENSION_UNIT_SHORT,
  ITEM_TYPE_LABELS,
  SUPPLY_TYPE_LABELS,
  UNIT_LABELS,
  UNIT_SHORT,
} from '@/lib/labels'
import type { FormState } from '@/lib/actions/items'
import type { MaterialOption } from '@/lib/queries/items'
import {
  DimensionUnit,
  ItemType,
  SupplyType,
  UnitOfMeasure,
} from '@/generated/prisma/enums'

export type ItemFormValues = {
  name: string
  description: string | null
  type: ItemType
  supplyType: SupplyType
  isFlatRate: boolean
  materialId: string | null
  unit: UnitOfMeasure
  rate: number
  purchaseRate: number | null
  brand: string | null
  shade: string | null
  dimensionUnit: DimensionUnit
  thickness: number | null
  length: number | null
  width: number | null
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
  materials,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: ItemFormValues
  submitLabel: string
  materials: MaterialOption[]
}) {
  const router = useRouter()
  const [type, setType] = useState<ItemType>(values.type)
  const [supplyType, setSupplyTypeState] = useState<SupplyType>(
    values.supplyType,
  )

  function setSupplyType(next: SupplyType) {
    setSupplyTypeState(next)

    if (next === 'SERVICE' && type !== 'SERVICE') {
      setType('SERVICE')
    }

    if (next === 'GOODS' && type === 'SERVICE') {
      setType('MATERIAL')
    }
  }

  function setItemType(next: ItemType) {
    setType(next)
    setSupplyTypeState(next === 'SERVICE' ? 'SERVICE' : 'GOODS')
  }
  const [isFlatRate, setIsFlatRate] = useState(values.isFlatRate)
  const [unit, setUnit] = useState<UnitOfMeasure>(values.unit)
  const [dimensionUnit, setDimensionUnit] = useState<DimensionUnit>(
    values.dimensionUnit,
  )
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | number | null | undefined) =>
    submitted[name] ?? (fallback === null || fallback === undefined ? '' : String(fallback))
  const isService = supplyType === 'SERVICE'

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
                defaultValue={keep('name', values.name)}
                required
                invalid={Boolean(errors.name)}
              />
              {errors.name ? <ErrorMessage>{errors.name}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>Type</Label>
              <Listbox name="type" value={type} onChange={setItemType}>
                {Object.values(ItemType).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{ITEM_TYPE_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Material</Label>
              <MaterialCombobox
                name="materialId"
                options={materials}
                defaultValue={keep('materialId', values.materialId)}
              />
            </Field>
            <Field>
              <Label>Goods or service</Label>
              <Listbox
                name="supplyType"
                value={supplyType}
                onChange={setSupplyType}
              >
                {Object.values(SupplyType).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{SUPPLY_TYPE_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
              <Description>
                Decides whether an HSN or SAC code applies.
              </Description>
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

          <SwitchField>
            <Label>Flat charge</Label>
            <Description>
              A fixed amount per line, ignoring size and quantity. Use for
              labour or handling charges that do not vary with the job.
            </Description>
            <Switch
              name="isFlatRate"
              checked={isFlatRate}
              onChange={setIsFlatRate}
              value="true"
            />
          </SwitchField>

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
        <Legend>Pricing</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>
                {isFlatRate ? 'Amount' : `Rate per ${UNIT_SHORT[unit]}`}
              </Label>
              <Input
                name="rate"
                type="number"
                step="0.01"
                min={0}
                defaultValue={keep('rate', values.rate)}
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
                defaultValue={keep('purchaseRate', values.purchaseRate)}
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
                defaultValue={keep('taxRatePercent', values.taxRatePercent)}
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
              defaultValue={keep('hsnCode', values.hsnCode)}
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

      {isService || isFlatRate ? null : (
        <>
          <Divider />

          <Fieldset>
            <Legend>Specification</Legend>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Field>
                  <Label>Brand</Label>
                  <Input name="brand" defaultValue={keep('brand', values.brand)} />
                </Field>
                <Field>
                  <Label>Shade / finish</Label>
                  <Input name="shade" defaultValue={keep('shade', values.shade)} />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <Field className="sm:col-span-2">
                  <Label>Measured in</Label>
                  <Listbox
                    name="dimensionUnit"
                    value={dimensionUnit}
                    onChange={setDimensionUnit}
                  >
                    {Object.values(DimensionUnit).map((value) => (
                      <ListboxOption key={value} value={value}>
                        <ListboxLabel>{DIMENSION_UNIT_LABELS[value]}</ListboxLabel>
                      </ListboxOption>
                    ))}
                  </Listbox>
                  <Description>
                    Applies to thickness, length and width below.
                  </Description>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <Field>
                  <Label>Thickness ({DIMENSION_UNIT_SHORT[dimensionUnit]})</Label>
                  <Input
                    name="thickness"
                    type="number"
                    step="0.001"
                    min={0}
                    defaultValue={keep('thickness', values.thickness)}
                  />
                </Field>
                <Field>
                  <Label>Length ({DIMENSION_UNIT_SHORT[dimensionUnit]})</Label>
                  <Input
                    name="length"
                    type="number"
                    step="0.001"
                    min={0}
                    defaultValue={keep('length', values.length)}
                  />
                </Field>
                <Field>
                  <Label>Width ({DIMENSION_UNIT_SHORT[dimensionUnit]})</Label>
                  <Input
                    name="width"
                    type="number"
                    step="0.001"
                    min={0}
                    defaultValue={keep('width', values.width)}
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
            <Textarea name="notes" rows={3} defaultValue={keep('notes', values.notes)} />
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
