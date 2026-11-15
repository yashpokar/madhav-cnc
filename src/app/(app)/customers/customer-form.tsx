'use client'

import { useActionState, useState, useRef } from 'react'
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
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox'
import { PartnerCombobox } from '@/components/partner-combobox'
import { Textarea } from '@/components/catalyst/textarea'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { LocationFields } from '@/components/location-fields'
import type { FormState } from '@/lib/actions/customers'
import type { PartnerOption } from '@/lib/queries/partners'
import { CustomerStatus, CustomerType } from '@/generated/prisma/enums'

export type CustomerFormValues = {
  name: string
  type: CustomerType
  status: CustomerStatus
  phone: string
  altPhone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  gstin: string | null
  pan: string | null
  dateOfBirth: string | null
  anniversaryDate: string | null
  preferredArchitectId: string | null
  preferredCarpenterId: string | null
  paymentTermsDays: number | null
  notes: string | null
  openingDue: number | null
  openingAsOf: string | null
}

const TYPE_LABELS: Record<CustomerType, string> = {
  INDIVIDUAL: 'Individual',
  COMPANY: 'Company',
}

const STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ON_HOLD: 'On hold',
}

export function CustomerForm({
  action,
  values,
  submitLabel,
  architects,
  carpenters,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: CustomerFormValues
  submitLabel: string
  architects: PartnerOption[]
  carpenters: PartnerOption[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  useDirtyGuard(formRef)
  const [type, setType] = useState<CustomerType>(values.type)
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const submitted = state.status === 'error' ? (state.values ?? {}) : {}
  const keep = (name: string, fallback: string | number | null | undefined) =>
    submitted[name] ?? (fallback === null || fallback === undefined ? '' : String(fallback))

  return (
    <form ref={formRef} action={formAction} className="grid w-full max-w-5xl grid-cols-1 gap-6">
      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Customer</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
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
              <Listbox name="type" value={type} onChange={setType}>
                {Object.values(CustomerType).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{TYPE_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field>
              <Label>Phone</Label>
              <Input
                name="phone"
                type="tel"
                defaultValue={keep('phone', values.phone)}
                required
                invalid={Boolean(errors.phone)}
              />
              {errors.phone ? <ErrorMessage>{errors.phone}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>Alternate phone</Label>
              <Input
                name="altPhone"
                type="tel"
                defaultValue={keep('altPhone', values.altPhone)}
              />
            </Field>
            <Field>
              <Label>Email</Label>
              <Input
                name="email"
                type="email"
                defaultValue={keep('email', values.email)}
                invalid={Boolean(errors.email)}
              />
              {errors.email ? <ErrorMessage>{errors.email}</ErrorMessage> : null}
            </Field>
          </div>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Address</Legend>
        <FieldGroup>
          <Field>
            <Label>Address</Label>
            <Textarea name="address" rows={2} defaultValue={keep('address', values.address)} />
          </Field>
          <LocationFields
            defaultState={keep('state', values.state)}
            defaultCity={keep('city', values.city)}
            defaultPincode={keep('pincode', values.pincode)}
            errors={{ pincode: errors.pincode }}
          />
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Preferred partners</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field>
              <Label>Preferred architect</Label>
              <PartnerCombobox
                name="preferredArchitectId"
                type="ARCHITECT"
                options={architects}
                defaultValue={keep('preferredArchitectId', values.preferredArchitectId)}
                placeholder="Search architects…"
              />
            </Field>
            <Field>
              <Label>Preferred carpenter</Label>
              <PartnerCombobox
                name="preferredCarpenterId"
                type="CARPENTER"
                options={carpenters}
                defaultValue={keep('preferredCarpenterId', values.preferredCarpenterId)}
                placeholder="Search carpenters…"
              />
            </Field>
          </div>
          <Text>
            Optional. Quotations and orders start from these, and can be changed
            per job.
          </Text>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Occasions</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field>
              <Label>Date of birth</Label>
              <Input
                name="dateOfBirth"
                type="date"
                defaultValue={keep('dateOfBirth', values.dateOfBirth)}
              />
            </Field>
            <Field>
              <Label>Anniversary</Label>
              <Input
                name="anniversaryDate"
                type="date"
                defaultValue={keep('anniversaryDate', values.anniversaryDate)}
              />
            </Field>
          </div>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Tax &amp; terms</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field>
              <Label>GSTIN</Label>
              <Input
                name="gstin"
                defaultValue={keep('gstin', values.gstin)}
                invalid={Boolean(errors.gstin)}
                className="uppercase"
              />
              {errors.gstin ? <ErrorMessage>{errors.gstin}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>PAN</Label>
              <Input
                name="pan"
                defaultValue={keep('pan', values.pan)}
                invalid={Boolean(errors.pan)}
                className="uppercase"
              />
              {errors.pan ? <ErrorMessage>{errors.pan}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>Payment terms</Label>
              <Input
                name="paymentTermsDays"
                type="number"
                min={0}
                max={365}
                defaultValue={keep('paymentTermsDays', values.paymentTermsDays)}
              />
              <Description>Days.</Description>
            </Field>
          </div>
          {type === 'INDIVIDUAL' ? (
            <Text>Tax details are usually only needed for company customers.</Text>
          ) : null}
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Opening balance</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field>
              <Label>Opening balance (they owe you)</Label>
              <Input
                name="openingDue"
                type="number"
                step="0.01"
                min={0}
                defaultValue={keep('openingDue', values.openingDue || null)}
                invalid={Boolean(errors.openingDue)}
              />
              {errors.openingDue ? (
                <ErrorMessage>{errors.openingDue}</ErrorMessage>
              ) : null}
            </Field>
            <Field>
              <Label>As of</Label>
              <Input
                name="openingAsOf"
                type="date"
                defaultValue={keep('openingAsOf', values.openingAsOf)}
                invalid={Boolean(errors.openingAsOf)}
              />
              {errors.openingAsOf ? (
                <ErrorMessage>{errors.openingAsOf}</ErrorMessage>
              ) : null}
            </Field>
          </div>
          <Text>
            What this customer still owed before you started using the system.
            Invoices and receipts already in the system are not part of this.
            Receipts can be applied to it.
          </Text>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field>
              <Label>Status</Label>
              <Listbox name="status" defaultValue={keep('status', values.status)}>
                {Object.values(CustomerStatus).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{STATUS_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>
          <Field>
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} defaultValue={keep('notes', values.notes)} />
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
