'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
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
import { Divider } from '@/components/catalyst/divider'
import { FormBanner } from '@/components/form-banner'
import type { FormState } from '@/lib/actions/partners'
import { PartnerType } from '@/generated/prisma/enums'

export type PartnerFormValues = {
  id?: string
  type: PartnerType
  name: string
  firmName: string | null
  phone: string
  altPhone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  isActive: boolean
  notes: string | null
}

const TYPE_LABELS: Record<PartnerType, string> = {
  ARCHITECT: 'Architect',
  CARPENTER: 'Carpenter',
}

export function PartnerForm({
  action,
  values,
  submitLabel,
  lockType = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: PartnerFormValues
  submitLabel: string
  lockType?: boolean
}) {
  const router = useRouter()
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
        <Legend>Details</Legend>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field>
              <Label>Type</Label>
              <Select name="type" defaultValue={values.type} disabled={lockType}>
                {Object.values(PartnerType).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
              {lockType ? (
                <>
                  <input type="hidden" name="type" value={values.type} />
                  <Description>Type cannot be changed after creation.</Description>
                </>
              ) : null}
            </Field>
            <Field>
              <Label>Name</Label>
              <Input
                name="name"
                defaultValue={values.name}
                required
                invalid={Boolean(errors.name)}
              />
              {errors.name ? <ErrorMessage>{errors.name}</ErrorMessage> : null}
            </Field>
          </div>

          <Field>
            <Label>Firm name</Label>
            <Input name="firmName" defaultValue={values.firmName ?? ''} />
            <Description>Optional.</Description>
          </Field>

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
              <Input name="altPhone" type="tel" defaultValue={values.altPhone ?? ''} />
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
        <FieldGroup>
          <Field>
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} defaultValue={values.notes ?? ''} />
          </Field>
          <SwitchField>
            <Label>Active</Label>
            <Description>
              Inactive partners stay on past records but cannot be selected on new
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
