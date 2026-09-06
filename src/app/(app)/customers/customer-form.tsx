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
import { PartnerCombobox } from '@/components/partner-combobox'
import { Textarea } from '@/components/catalyst/textarea'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
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

function partnerLabel(partner: PartnerOption) {
  const parts = [partner.name]

  if (partner.firmName) parts.push(partner.firmName)
  if (partner.city) parts.push(partner.city)

  return parts.join(' · ')
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
  const [type, setType] = useState<CustomerType>(values.type)
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    { status: 'idle' },
  )

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8">
      {state.status === 'error' ? (
        <FormBanner tone="error">{state.message}</FormBanner>
      ) : null}
      {state.status === 'success' ? (
        <FormBanner tone="success">{state.message}</FormBanner>
      ) : null}

      <Fieldset>
        <Legend>Customer</Legend>
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
                {Object.values(CustomerType).map((value) => (
                  <ListboxOption key={value} value={value}>
                    <ListboxLabel>{TYPE_LABELS[value]}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Phone</Label>
              <Input
                name="phone"
                type="tel"
                defaultValue={values.phone}
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
                defaultValue={values.altPhone ?? ''}
              />
            </Field>
            <Field>
              <Label>Email</Label>
              <Input
                name="email"
                type="email"
                defaultValue={values.email ?? ''}
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
            <Textarea name="address" rows={2} defaultValue={values.address ?? ''} />
          </Field>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>City</Label>
              <Input name="city" defaultValue={values.city ?? ''} />
            </Field>
            <Field>
              <Label>State</Label>
              <Input name="state" defaultValue={values.state ?? ''} />
            </Field>
            <Field>
              <Label>Pincode</Label>
              <Input
                name="pincode"
                inputMode="numeric"
                defaultValue={values.pincode ?? ''}
                invalid={Boolean(errors.pincode)}
              />
              {errors.pincode ? (
                <ErrorMessage>{errors.pincode}</ErrorMessage>
              ) : null}
            </Field>
          </div>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Preferred partners</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Preferred architect</Label>
              <PartnerCombobox
                name="preferredArchitectId"
                type="ARCHITECT"
                options={architects}
                defaultValue={values.preferredArchitectId}
                placeholder="Search architects…"
              />
            </Field>
            <Field>
              <Label>Preferred carpenter</Label>
              <PartnerCombobox
                name="preferredCarpenterId"
                type="CARPENTER"
                options={carpenters}
                defaultValue={values.preferredCarpenterId}
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Date of birth</Label>
              <Input
                name="dateOfBirth"
                type="date"
                defaultValue={values.dateOfBirth ?? ''}
              />
            </Field>
            <Field>
              <Label>Anniversary</Label>
              <Input
                name="anniversaryDate"
                type="date"
                defaultValue={values.anniversaryDate ?? ''}
              />
            </Field>
          </div>
        </FieldGroup>
      </Fieldset>

      <Divider />

      <Fieldset>
        <Legend>Tax &amp; terms</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>GSTIN</Label>
              <Input
                name="gstin"
                defaultValue={values.gstin ?? ''}
                invalid={Boolean(errors.gstin)}
                className="uppercase"
              />
              {errors.gstin ? <ErrorMessage>{errors.gstin}</ErrorMessage> : null}
            </Field>
            <Field>
              <Label>PAN</Label>
              <Input
                name="pan"
                defaultValue={values.pan ?? ''}
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
                defaultValue={values.paymentTermsDays ?? ''}
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
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field>
              <Label>Status</Label>
              <Listbox name="status" defaultValue={values.status}>
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
            <Textarea name="notes" rows={3} defaultValue={values.notes ?? ''} />
          </Field>
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
